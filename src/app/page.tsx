"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const SOFIA_URL = process.env.NEXT_PUBLIC_SOFIA_URL || "https://whatsapp-agentkit-production-6718.up.railway.app";

const ETAPAS = ["nuevo", "respondio", "interesado", "presupuesto", "seguimiento", "cerrado"];
const ETAPA_LABELS: Record<string, string> = {
  nuevo: "Nuevo", respondio: "Respondió", interesado: "Interesado",
  presupuesto: "Presupuesto", seguimiento: "Seguimiento", cerrado: "Cerrado",
};
const ETAPA_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  nuevo:       { bg: "bg-gray-100",   text: "text-gray-600",   dot: "bg-gray-400",    border: "border-gray-300" },
  respondio:   { bg: "bg-blue-50",    text: "text-blue-600",   dot: "bg-blue-400",    border: "border-blue-300" },
  interesado:  { bg: "bg-yellow-50",  text: "text-yellow-700", dot: "bg-yellow-400",  border: "border-yellow-300" },
  presupuesto: { bg: "bg-orange-50",  text: "text-orange-600", dot: "bg-orange-400",  border: "border-orange-300" },
  seguimiento: { bg: "bg-purple-50",  text: "text-purple-600", dot: "bg-purple-400",  border: "border-purple-300" },
  cerrado:     { bg: "bg-emerald-50", text: "text-emerald-600",dot: "bg-emerald-400", border: "border-emerald-300" },
};

const PRIMARY = "#2e785f";
const PRIMARY_LIGHT = "#e8f4f0";

const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🥰","😍","🤩","😘","😙","🙂",
  "🤗","🤭","🤔","🤐","😐","😑","😶","😏","😒","🙄","😬","😔","😪","😴","😷","🥳",
  "👍","👎","👋","🤚","✋","👌","✌️","🤞","🤙","👏","🙌","🤝","🙏","💪","☝️","👈",
  "👉","👆","👇","❤️","🧡","💛","💚","💙","💜","🖤","💔","💕","💖","💗","💓","💞",
  "🔥","⭐","✨","💫","🎉","🎊","🎁","🏆","👑","💎","🌟","⚡","🌈","☀️","🌙","💯",
  "✅","❌","⚠️","📌","📎","🔔","💬","📱","💻","📷","📸","🎥","📄","📝","💰","💳",
  "😤","😡","🤬","😱","😨","😰","😥","😢","😭","😤","🤯","😳","🥺","😞","😓","😩",
];

const QUICK_REACTIONS = ["👍","❤️","😂","😮","😢","😡"];

function formatTel(tel: string) {
  const digits = tel.replace(/\D/g, "");
  if (digits.length >= 10) return `+${digits.slice(0,2)} ${digits.slice(2,5)} ${digits.slice(5,8)}-${digits.slice(8)}`;
  return tel;
}
function getInitial(nombre: string, telefono: string) {
  if (nombre && nombre !== telefono && nombre.length > 0 && isNaN(Number(nombre[0]))) return nombre[0].toUpperCase();
  return "?";
}
function getDisplayName(nombre: string, telefono: string) {
  if (!nombre || nombre === telefono || !isNaN(Number(nombre))) return formatTel(telefono);
  return nombre;
}
function calcularScore(conv: Conversacion): number {
  const base: Record<string, number> = { nuevo:10, respondio:25, interesado:50, presupuesto:70, seguimiento:85, cerrado:100 };
  let s = base[conv.etapa] ?? 10;
  if (conv.derivada) s = Math.min(s+5, 100);
  if (conv.cobro_pendiente) s = Math.max(s-8, 0);
  return s;
}
function getTemp(score: number) {
  if (score >= 65) return { label:"Caliente", emoji:"🔥", color:"#ef4444" };
  if (score >= 35) return { label:"Tibio",    emoji:"🌡️", color:"#f97316" };
  return               { label:"Frío",     emoji:"❄️", color:"#60a5fa" };
}
function exportarCSV(conversaciones: Conversacion[]) {
  const h = ["Nombre","Teléfono","Etapa","Score","Derivada","Cobro Pendiente","Monto","Resumen"];
  const rows = conversaciones.map(c=>[
    getDisplayName(c.nombre,c.telefono), c.telefono, ETAPA_LABELS[c.etapa]||c.etapa,
    calcularScore(c), c.derivada?"Sí":"No", c.cobro_pendiente?"Sí":"No",
    c.monto_cobro||"", (c.resumen||"").replace(/,/g,";"),
  ]);
  const csv = [h,...rows].map(r=>r.join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
  a.download = `hefe-crm-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

interface Conversacion {
  telefono: string; nombre: string; etapa: string; derivada: boolean;
  cobro_pendiente: boolean; monto_cobro: string; resumen: string;
  contacto_existente: boolean; actualizado: string; ultimo_mensaje: string; ultimo_rol: string;
}
interface Mensaje {
  role: string; content: string; message_id: string;
}
interface ArchivoPreview {
  file: File; url: string; tipo: "imagen" | "documento" | "sticker";
}

export default function Home() {
  const [password, setPassword] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [seleccionada, setSeleccionada] = useState<string|null>(null);
  const [historial, setHistorial] = useState<Mensaje[]>([]);
  const [vista, setVista] = useState<"lista"|"pipeline"|"dashboard">("lista");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [dragOver, setDragOver] = useState<string|null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [delayRespuesta, setDelayRespuesta] = useState("normal");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  // Chat features
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<Mensaje|null>(null);
  const [archivoPreview, setArchivoPreview] = useState<ArchivoPreview|null>(null);
  const [msgHover, setMsgHover] = useState<number|null>(null);
  const [showReactions, setShowReactions] = useState<number|null>(null);
  const [editandoIdx, setEditandoIdx] = useState<number|null>(null);
  const [editTexto, setEditTexto] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Cerrar emoji picker al hacer click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function login() {
    setCargando(true); setError("");
    try {
      const res = await fetch(`${SOFIA_URL}/api/conversaciones?x_password=${password}`);
      if (res.status === 401) { setError("Contraseña incorrecta"); setCargando(false); return; }
      setConversaciones(await res.json());
      setAutenticado(true);
    } catch { setError("No se pudo conectar con el servidor"); }
    finally { setCargando(false); }
  }

  async function cargarConfig() {
    try {
      const res = await fetch(`${SOFIA_URL}/api/configuracion?x_password=${password}`);
      const data = await res.json();
      setDelayRespuesta(data.delay_respuesta || "normal");
      setSystemPrompt(data.system_prompt || "");
    } catch {}
  }

  async function guardarConfig(patch: Record<string, string>) {
    await fetch(`${SOFIA_URL}/api/configuracion?x_password=${password}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function guardarPrompt() {
    setSavingPrompt(true);
    await guardarConfig({ system_prompt: systemPrompt });
    setSavingPrompt(false);
  }

  async function toggleSofia(telefono: string, pausar: boolean) {
    const endpoint = pausar ? "pausar" : "reactivar";
    await fetch(`${SOFIA_URL}/${endpoint}/${telefono}?x_password=${password}`, { method: "POST" });
    setConversaciones(prev => prev.map(c => c.telefono === telefono ? { ...c, derivada: pausar } : c));
  }

  const cargarConversaciones = useCallback(async () => {
    try {
      const res = await fetch(`${SOFIA_URL}/api/conversaciones?x_password=${password}`);
      setConversaciones(await res.json());
    } catch {}
  }, [password]);

  async function abrirChat(telefono: string) {
    setSeleccionada(telefono);
    setReplyTo(null); setArchivoPreview(null); setShowEmoji(false);
    const res = await fetch(`${SOFIA_URL}/api/conversaciones/${telefono}?x_password=${password}`);
    const data = await res.json();
    setHistorial(data.mensajes || []);
  }

  async function enviarMensaje() {
    if (!seleccionada || (!texto.trim() && !archivoPreview)) return;
    setEnviando(true);
    try {
      if (archivoPreview) {
        const form = new FormData();
        form.append("archivo", archivoPreview.file);
        form.append("tipo", archivoPreview.tipo);
        form.append("caption", texto.trim());
        if (replyTo?.message_id) form.append("quoted_id", replyTo.message_id);
        await fetch(`${SOFIA_URL}/api/conversaciones/${seleccionada}/enviar-media?x_password=${password}`, {
          method: "POST", body: form,
        });
        setArchivoPreview(null);
      } else {
        await fetch(`${SOFIA_URL}/api/conversaciones/${seleccionada}/enviar?x_password=${password}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensaje: texto.trim(), quoted_id: replyTo?.message_id || "" }),
        });
      }
      setTexto(""); setReplyTo(null);
      await abrirChat(seleccionada);
    } finally { setEnviando(false); }
  }

  async function enviarReaccion(msg: Mensaje, emoji: string) {
    if (!seleccionada || !msg.message_id) return;
    setShowReactions(null);
    await fetch(`${SOFIA_URL}/api/conversaciones/${seleccionada}/reaccionar?x_password=${password}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: msg.message_id, emoji }),
    });
  }

  async function guardarEdicion(msg: Mensaje) {
    if (!seleccionada || !msg.message_id || !editTexto.trim()) return;
    await fetch(`${SOFIA_URL}/api/conversaciones/${seleccionada}/mensajes/${msg.message_id}?x_password=${password}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: editTexto.trim() }),
    });
    setEditandoIdx(null);
    await abrirChat(seleccionada);
  }

  async function cambiarEtapa(telefono: string, etapa: string) {
    await fetch(`${SOFIA_URL}/api/conversaciones/${telefono}/etapa?x_password=${password}&etapa=${etapa}`, { method: "PUT" });
    setConversaciones(prev => prev.map(c => c.telefono === telefono ? { ...c, etapa } : c));
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      await fetch(`${SOFIA_URL}/sincronizar?x_password=${password}`, { method: "POST" });
      let done = false;
      for (let i = 0; i < 60 && !done; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const r = await fetch(`${SOFIA_URL}/sincronizar/estado?x_password=${password}`);
        const d = await r.json();
        if (!d.corriendo) done = true;
      }
      await cargarConversaciones();
    } finally { setSincronizando(false); }
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isSticker = file.name.endsWith(".webp");
    const tipo: ArchivoPreview["tipo"] = isSticker ? "sticker" : isImage ? "imagen" : "documento";
    const url = isImage ? URL.createObjectURL(file) : "";
    setArchivoPreview({ file, url, tipo });
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
  }

  // Drag & drop kanban
  function handleDragStart(e: React.DragEvent, telefono: string) { e.dataTransfer.setData("telefono", telefono); }
  function handleDragOver(e: React.DragEvent, etapa: string) { e.preventDefault(); setDragOver(etapa); }
  function handleDrop(e: React.DragEvent, etapa: string) {
    e.preventDefault(); setDragOver(null);
    const tel = e.dataTransfer.getData("telefono");
    if (tel) cambiarEtapa(tel, etapa);
  }

  useEffect(() => {
    if (autenticado) {
      cargarConfig();
      const iv = setInterval(cargarConversaciones, 15000);
      return () => clearInterval(iv);
    }
  }, [autenticado, cargarConversaciones]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [historial]);

  const convFiltradas = conversaciones.filter(c => {
    const n = getDisplayName(c.nombre, c.telefono).toLowerCase();
    return n.includes(busqueda.toLowerCase()) || c.telefono.includes(busqueda);
  });
  const convSeleccionada = conversaciones.find(c => c.telefono === seleccionada);

  const stats = {
    total: conversaciones.length,
    derivados: conversaciones.filter(c=>c.derivada).length,
    cobroPendiente: conversaciones.filter(c=>c.cobro_pendiente).length,
    calientes: conversaciones.filter(c=>calcularScore(c)>=65).length,
    porEtapa: ETAPAS.map(e=>({ etapa:e, count:conversaciones.filter(c=>c.etapa===e).length })),
  };

  function renderMensaje(msg: Mensaje, i: number) {
    const esUser = msg.role === "user";
    const content = msg.content;

    // Mensajes de sistema/acción — mostrar como texto pequeño centrado
    const esSistema = /^\[.{1,30}\]$/.test(content.trim());
    if (esSistema) {
      return (
        <div key={i} className="flex justify-center">
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{content}</span>
        </div>
      );
    }

    // Documento con URL: [Documento: nombre](url)
    const docMatch = content.match(/^\[Documento: (.+?)\]\((.+?)\)$/);
    // Documento sin URL: [Documento: nombre]
    const docNoUrlMatch = !docMatch ? content.match(/^\[Documento: (.+?)\]$/) : null;
    // Imagen con URL: [Imagen](url) o [Imagen](url) caption
    const imgMatch = content.match(/^\[Imagen\]\((.+?)\)(.*)?$/);
    // Video con URL: [Video](url)
    const vidMatch = content.match(/^\[Video\]\((.+?)\)(.*)?$/);
    const esImagen = content.startsWith("[Imagen") && !imgMatch;
    const esAudio = content.startsWith("[Audio");
    const esVideo = content.startsWith("[Video") && !vidMatch;
    const esSticker = content.startsWith("[Sticker");
    const isHovered = msgHover === i;
    const isEditing = editandoIdx === i;

    return (
      <div
        key={i}
        className={`flex ${esUser ? "justify-start" : "justify-end"} group`}
        onMouseEnter={() => setMsgHover(i)}
        onMouseLeave={() => { setMsgHover(null); setShowReactions(null); }}
      >
        <div className={`flex items-end gap-2 max-w-xs lg:max-w-md ${esUser ? "flex-row" : "flex-row-reverse"}`}>

          {/* Avatar */}
          {esUser ? (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 self-end mb-1"
              style={{backgroundColor:"#94a3b8"}}>
              {convSeleccionada ? getInitial(convSeleccionada.nombre, convSeleccionada.telefono) : "?"}
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 self-end mb-1"
              style={{backgroundColor:PRIMARY}}>
              S
            </div>
          )}

          {/* Bubble */}
          <div className="relative">
            {isEditing ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  autoFocus
                  value={editTexto}
                  onChange={e=>setEditTexto(e.target.value)}
                  className="px-3 py-2 rounded-2xl text-sm border-2 border-blue-400 focus:outline-none resize-none"
                  style={{ backgroundColor: PRIMARY, color: "white", minWidth: "200px" }}
                  rows={2}
                />
                <div className="flex gap-1 justify-end">
                  <button onClick={()=>setEditandoIdx(null)} className="px-2 py-1 text-xs bg-gray-200 rounded-lg">Cancelar</button>
                  <button onClick={()=>guardarEdicion(msg)} className="px-2 py-1 text-xs text-white rounded-lg" style={{backgroundColor:PRIMARY}}>Guardar</button>
                </div>
              </div>
            ) : (
              <div
                className="px-4 py-2.5 text-sm shadow-sm"
                style={esUser
                  ? { backgroundColor:"#f1f5f9", color:"#1e293b", borderRadius:"18px 18px 18px 4px" }
                  : { backgroundColor:PRIMARY, color:"white", borderRadius:"18px 18px 4px 18px" }
                }
              >
                {imgMatch ? (
                  <div className="flex flex-col gap-1">
                    <a href={imgMatch[1]} target="_blank" rel="noopener noreferrer">
                      <img src={imgMatch[1]} alt="Imagen"
                        className="rounded-xl max-w-full object-cover cursor-pointer hover:opacity-90 transition"
                        style={{maxHeight:"200px", maxWidth:"240px"}}
                        onError={e => { (e.target as HTMLImageElement).style.display="none"; }}
                      />
                    </a>
                    {imgMatch[2]?.trim() && <span className="text-xs opacity-80">{imgMatch[2].trim()}</span>}
                  </div>
                ) : vidMatch ? (
                  <div className="flex flex-col gap-1">
                    <a href={vidMatch[1]} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:opacity-80 transition"
                      style={{backgroundColor: esUser ? "#f3f4f6" : "rgba(255,255,255,0.15)"}}>
                      <span className="text-2xl">🎥</span>
                      <span className="text-xs font-medium">Ver video ↗</span>
                    </a>
                    {vidMatch[2]?.trim() && <span className="text-xs opacity-80">{vidMatch[2].trim()}</span>}
                  </div>
                ) : docMatch ? (
                  <a href={docMatch[2]} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:underline"
                    style={{color: esUser ? PRIMARY : "white"}}>
                    <span className="text-lg">📄</span>
                    <span className="font-medium">{docMatch[1]}</span>
                    <span className="text-xs opacity-70">↗</span>
                  </a>
                ) : docNoUrlMatch ? (
                  <span className="flex items-center gap-2">
                    <span className="text-lg">📄</span>
                    <span className="font-medium">{docNoUrlMatch[1]}</span>
                  </span>
                ) : esImagen ? (
                  <span className="flex items-center gap-1">🖼️ {content.replace(/\[Imagen\]?:?\s?/g,"").replace("]","").trim()||"Imagen"}</span>
                ) : esAudio ? (
                  <span className="flex items-center gap-1">🎙️ Audio</span>
                ) : esVideo ? (
                  <span className="flex items-center gap-1">🎥 {content.replace(/\[Video\]?:?\s?/g,"").replace("]","").trim()||"Video"}</span>
                ) : esSticker ? (
                  <span>😊 Sticker</span>
                ) : (
                  <span style={{whiteSpace:"pre-wrap"}}>{content}</span>
                )}
                {!esUser && msg.message_id && (
                  <p className="text-xs opacity-40 mt-0.5 text-right">✓✓</p>
                )}
              </div>
            )}
          </div>

          {/* Actions on hover */}
          {isHovered && !isEditing && (
            <div className={`flex flex-col gap-1 ${esUser ? "items-start" : "items-end"}`}>
              {/* Reply */}
              <button
                onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-xs hover:bg-gray-100 transition"
                title="Responder"
              >↩</button>

              {/* Reactions */}
              <div className="relative">
                <button
                  onClick={() => setShowReactions(showReactions === i ? null : i)}
                  className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-xs hover:bg-gray-100 transition"
                  title="Reaccionar"
                >😊</button>
                {showReactions === i && (
                  <div className={`absolute bottom-8 ${esUser ? "left-0" : "right-0"} bg-white rounded-2xl shadow-xl p-2 flex gap-1.5 z-10 border border-gray-100`}>
                    {QUICK_REACTIONS.map(e => (
                      <button key={e} onClick={() => enviarReaccion(msg, e)}
                        className="text-xl hover:scale-125 transition-transform">
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit (solo mensajes propios con ID) */}
              {!esUser && msg.message_id && (
                <button
                  onClick={() => { setEditandoIdx(i); setEditTexto(msg.content); }}
                  className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-xs hover:bg-gray-100 transition"
                  title="Editar"
                >✏️</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== LOGIN =====
  if (!autenticado) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:PRIMARY_LIGHT}}>
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <img src="/logo.jpg" alt="HeFe" className="w-20 h-20 rounded-full object-cover mx-auto mb-4 shadow-md"/>
            <h1 className="text-2xl font-black text-gray-800">HeFe Uniformes</h1>
            <p className="text-sm mt-1" style={{color:PRIMARY}}>Panel de Sofia ✨</p>
          </div>
          <div className="space-y-3">
            <input type="password" placeholder="Contraseña" value={password}
              onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none"/>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button onClick={login} disabled={cargando}
              className="w-full text-white rounded-xl py-3 font-bold text-sm transition hover:opacity-90 disabled:opacity-50"
              style={{backgroundColor:PRIMARY}}>
              {cargando ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const DELAY_OPCIONES = [
    { valor: "inmediata", label: "Inmediata",  rango: "0–1 seg",   desc: "Responde al instante",             color: "#60a5fa" },
    { valor: "rapida",    label: "Rápida",     rango: "2–4 seg",   desc: "Rápido pero natural",               color: "#34d399" },
    { valor: "normal",    label: "Normal ✦",   rango: "5–8 seg",   desc: "Recomendado — parece humano",       color: PRIMARY   },
    { valor: "lenta",     label: "Lenta",      rango: "10–15 seg", desc: "Simula que está escribiendo largo", color: "#a78bfa" },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* MODAL CONFIG */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-black text-gray-800 text-base">⚙️ Configuración de Sofia</h2>
              <button onClick={()=>setShowConfig(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="mb-2">
              <p className="text-xs font-bold text-gray-700 mb-3">Velocidad de respuesta</p>
              <div className="space-y-2">
                {DELAY_OPCIONES.map(op => (
                  <button
                    key={op.valor}
                    onClick={() => { setDelayRespuesta(op.valor); guardarConfig({ delay_respuesta: op.valor }); }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition text-left"
                    style={delayRespuesta === op.valor
                      ? { borderColor: op.color, backgroundColor: op.color + "15" }
                      : { borderColor: "#e5e7eb", backgroundColor: "white" }
                    }
                  >
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor: op.color}}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{op.label}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{backgroundColor: op.color + "20", color: op.color}}>
                          {op.rango}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{op.desc}</p>
                    </div>
                    {delayRespuesta === op.valor && (
                      <span className="text-lg flex-shrink-0" style={{color: op.color}}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-3 text-center">
              El delay varía aleatoriamente dentro del rango para parecer humano
            </p>

            {/* System prompt editor */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-700 mb-2">Personalidad de Sofia</p>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={6}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none resize-none font-mono"
                placeholder="Sos Sofia, asistente de HeFe Uniformes..."
              />
              <button
                onClick={guardarPrompt}
                disabled={savingPrompt}
                className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: PRIMARY }}
              >
                {savingPrompt ? "Guardando..." : "Guardar prompt"}
              </button>
              <p className="text-xs text-gray-400 mt-1.5 text-center">Sofia usa este texto en cada respuesta</p>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="HeFe" className="w-9 h-9 rounded-full object-cover shadow-sm"/>
          <div>
            <h1 className="font-black text-gray-800 text-sm leading-tight">HeFe Uniformes</h1>
            <p className="text-xs leading-tight" style={{color:PRIMARY}}>Panel de Sofia</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-1"/>
          {(["lista","pipeline","dashboard"] as const).map(v=>(
            <button key={v} onClick={()=>setVista(v)}
              className="px-3 py-2 rounded-lg text-xs font-semibold transition"
              style={vista===v ? {backgroundColor:PRIMARY,color:"white"} : {backgroundColor:"#f3f4f6",color:"#4b5563"}}>
              {v==="lista" ? "💬 Chats" : v==="pipeline" ? "📋 Kanban" : "📈 Dashboard"}
            </button>
          ))}
          <button onClick={()=>exportarCSV(conversaciones)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">⬇ CSV</button>
          <button onClick={sincronizar} disabled={sincronizando}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50"
            style={{backgroundColor:PRIMARY_LIGHT,color:PRIMARY}}>
            {sincronizando ? "⟳ Sync..." : "⟳ Sync"}
          </button>
          <button onClick={()=>setShowConfig(true)}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
            ⚙️
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ===== LISTA / CHATS ===== */}
        {vista === "lista" && (
          <>
            {/* Sidebar */}
            <div className="w-72 bg-white border-r border-gray-100 flex flex-col flex-shrink-0">
              <div className="p-3 border-b border-gray-100">
                <input type="text" placeholder="Buscar cliente..." value={busqueda}
                  onChange={e=>setBusqueda(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs focus:outline-none"/>
                <p className="text-xs text-gray-400 mt-2 px-1">{convFiltradas.length} conversaciones</p>
              </div>
              <div className="overflow-y-auto flex-1">
                {convFiltradas.map(conv => {
                  const ec = ETAPA_COLORS[conv.etapa]||ETAPA_COLORS.nuevo;
                  const nombre = getDisplayName(conv.nombre,conv.telefono);
                  const activa = seleccionada === conv.telefono;
                  const temp = getTemp(calcularScore(conv));
                  return (
                    <div key={conv.telefono} onClick={()=>abrirChat(conv.telefono)}
                      className="p-3 border-b border-gray-50 cursor-pointer transition hover:bg-gray-50"
                      style={activa ? {backgroundColor:PRIMARY_LIGHT,borderLeft:`3px solid ${PRIMARY}`} : {}}>
                      <div className="flex items-start gap-2.5">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{backgroundColor:activa?PRIMARY:"#94a3b8"}}>
                          {getInitial(conv.nombre,conv.telefono)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-semibold text-gray-800 text-xs truncate">{nombre}</span>
                            <span className="text-xs ml-1" title={temp.label}>{temp.emoji}</span>
                          </div>
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ec.bg} ${ec.text}`}>
                              {ETAPA_LABELS[conv.etapa]||conv.etapa}
                            </span>
                            {conv.cobro_pendiente && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">💰</span>}
                          </div>
                          <p className="text-xs text-gray-400 truncate">{conv.ultimo_mensaje||"Sin mensajes"}</p>
                          {conv.derivada && <p className="text-xs font-medium mt-0.5" style={{color:"#f97316"}}>⚡ Con equipo</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chat */}
            <div className="flex-1 flex flex-col">
              {seleccionada && convSeleccionada ? (
                <>
                  {/* Chat header */}
                  <div className="bg-white border-b border-gray-100 px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{backgroundColor:PRIMARY}}>
                          {getInitial(convSeleccionada.nombre,convSeleccionada.telefono)}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{getDisplayName(convSeleccionada.nombre,convSeleccionada.telefono)}</p>
                          <p className="text-xs text-gray-400">{convSeleccionada.telefono}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(()=>{const s=calcularScore(convSeleccionada);const t=getTemp(s);return(
                          <span className="text-xs px-2 py-1 rounded-lg bg-gray-50 font-semibold" style={{color:t.color}}>{t.emoji} {s}/100</span>
                        );})()}
                        {convSeleccionada.cobro_pendiente && (
                          <span className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 font-semibold">
                            💰 {convSeleccionada.monto_cobro||"Cobro pendiente"}
                          </span>
                        )}
                        {/* Toggle Sofia */}
                        <button
                          onClick={() => toggleSofia(seleccionada, !convSeleccionada.derivada)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition"
                          style={convSeleccionada.derivada
                            ? { backgroundColor:"#fef3c7", color:"#d97706" }
                            : { backgroundColor:"#dcfce7", color:"#16a34a" }
                          }
                          title={convSeleccionada.derivada ? "Sofia pausada — click para reactivar" : "Sofia activa — click para pausar"}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${convSeleccionada.derivada ? "bg-amber-400" : "bg-green-400 animate-pulse"}`}/>
                          {convSeleccionada.derivada ? "Sofia pausada" : "Sofia activa"}
                        </button>
                        <select value={convSeleccionada.etapa||"nuevo"} onChange={e=>cambiarEtapa(seleccionada,e.target.value)}
                          className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer"
                          style={{color:PRIMARY}}>
                          {ETAPAS.map(e=><option key={e} value={e}>{ETAPA_LABELS[e]}</option>)}
                        </select>
                      </div>
                    </div>
                    {convSeleccionada.resumen && (
                      <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-1.5 italic">💡 {convSeleccionada.resumen}</p>
                    )}
                  </div>

                  {/* Messages */}
                  <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-2" style={{backgroundColor:"#f0f4f3"}}>
                    {historial.length === 0
                      ? <div className="flex items-center justify-center h-full text-gray-400 text-sm">Sin mensajes todavía</div>
                      : historial.map((msg,i) => renderMensaje(msg,i))
                    }
                  </div>

                  {/* Input area */}
                  <div className="bg-white border-t border-gray-100">

                    {/* Reply preview */}
                    {replyTo && (
                      <div className="flex items-center justify-between px-4 pt-2 pb-1 border-b border-gray-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{backgroundColor:PRIMARY}}/>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold" style={{color:PRIMARY}}>
                              {replyTo.role==="user" ? "Cliente" : "Fedra"}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{replyTo.content.slice(0,80)}</p>
                          </div>
                        </div>
                        <button onClick={()=>setReplyTo(null)} className="text-gray-400 hover:text-gray-600 text-lg ml-2">✕</button>
                      </div>
                    )}

                    {/* File preview */}
                    {archivoPreview && (
                      <div className="flex items-center gap-3 px-4 pt-2 pb-1 border-b border-gray-100">
                        {archivoPreview.tipo === "imagen" ? (
                          <img src={archivoPreview.url} alt="preview" className="w-16 h-16 object-cover rounded-xl"/>
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl">
                            {archivoPreview.tipo==="sticker" ? "😊" : "📄"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 truncate">{archivoPreview.file.name}</p>
                          <p className="text-xs text-gray-400">{(archivoPreview.file.size/1024).toFixed(0)} KB</p>
                        </div>
                        <button onClick={()=>{setArchivoPreview(null);if(fileRef.current)fileRef.current.value="";}}
                          className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                      </div>
                    )}

                    {/* Input row */}
                    <div className="flex items-end gap-2 px-4 py-3">

                      {/* Emoji picker */}
                      <div className="relative" ref={emojiRef}>
                        <button onClick={()=>setShowEmoji(!showEmoji)}
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xl hover:bg-gray-100 transition flex-shrink-0"
                          title="Emoji">
                          😊
                        </button>
                        {showEmoji && (
                          <div className="absolute bottom-12 left-0 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 z-20" style={{width:"280px"}}>
                            <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                              {EMOJIS.map(e=>(
                                <button key={e} onClick={()=>{setTexto(t=>t+e);setShowEmoji(false);inputRef.current?.focus();}}
                                  className="text-xl hover:bg-gray-100 rounded-lg p-1 transition">
                                  {e}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* File attach */}
                      <input ref={fileRef} type="file" className="hidden"
                        accept="image/*,application/pdf,.docx,.doc,.txt,.webp"
                        onChange={onFileSelect}/>
                      <button onClick={()=>fileRef.current?.click()}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xl hover:bg-gray-100 transition flex-shrink-0"
                        title="Adjuntar archivo">
                        📎
                      </button>

                      {/* Text input */}
                      <textarea
                        ref={inputRef}
                        value={texto}
                        onChange={e=>setTexto(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={archivoPreview ? "Agregar descripción (opcional)..." : "Escribí un mensaje..."}
                        rows={1}
                        className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none resize-none"
                        style={{maxHeight:"120px",overflowY:"auto"}}
                      />

                      {/* Send button */}
                      <button
                        onClick={enviarMensaje}
                        disabled={enviando || (!texto.trim() && !archivoPreview)}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white transition hover:opacity-90 disabled:opacity-40 flex-shrink-0"
                        style={{backgroundColor:PRIMARY}}>
                        {enviando ? "⟳" : "▶"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center" style={{backgroundColor:"#f0f4f3"}}>
                  <div className="text-center text-gray-400">
                    <img src="/logo.jpg" alt="HeFe" className="w-16 h-16 rounded-full object-cover mx-auto mb-4 opacity-40"/>
                    <p className="text-sm">Seleccioná una conversación</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== KANBAN ===== */}
        {vista === "pipeline" && (
          <div className="flex-1 overflow-x-auto p-5">
            <p className="text-xs text-gray-400 mb-3">Arrastrá las tarjetas entre columnas para cambiar la etapa</p>
            <div className="flex gap-4 min-w-max">
              {ETAPAS.map(etapa => {
                const contactos = conversaciones.filter(c=>c.etapa===etapa);
                const col = ETAPA_COLORS[etapa];
                const isDragTarget = dragOver === etapa;
                return (
                  <div key={etapa} className="w-60 flex-shrink-0 flex flex-col"
                    onDragOver={e=>handleDragOver(e,etapa)}
                    onDragLeave={()=>setDragOver(null)}
                    onDrop={e=>handleDrop(e,etapa)}>
                    <div className={`rounded-t-xl px-3 py-2.5 flex items-center justify-between ${col.bg} border-b-2 ${col.border}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${col.dot}`}/>
                        <span className={`font-bold text-xs ${col.text}`}>{ETAPA_LABELS[etapa]}</span>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/70 ${col.text}`}>{contactos.length}</span>
                    </div>
                    <div className={`rounded-b-xl p-2 space-y-2 flex-1 min-h-40 transition-colors ${isDragTarget ? "bg-gray-200" : "bg-gray-100"}`}
                      style={isDragTarget ? {outline:`2px solid ${PRIMARY}`} : {}}>
                      {contactos.map(conv => {
                        const score = calcularScore(conv);
                        const temp = getTemp(score);
                        return (
                          <div key={conv.telefono} draggable onDragStart={e=>handleDragStart(e,conv.telefono)}
                            className="bg-white rounded-xl p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition select-none"
                            onClick={()=>{setVista("lista");abrirChat(conv.telefono);}}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:PRIMARY}}>
                                {getInitial(conv.nombre,conv.telefono)}
                              </div>
                              <p className="font-semibold text-xs text-gray-800 truncate flex-1">{getDisplayName(conv.nombre,conv.telefono)}</p>
                              <span className="text-xs">{temp.emoji}</span>
                            </div>
                            <div className="mb-2">
                              <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                                <span>Score</span>
                                <span className="font-semibold" style={{color:temp.color}}>{score}/100</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{width:`${score}%`,backgroundColor:temp.color}}/>
                              </div>
                            </div>
                            {conv.resumen && <p className="text-xs text-gray-400 truncate italic mb-1">{conv.resumen}</p>}
                            {conv.cobro_pendiente && <p className="text-xs font-medium text-red-500">💰 {conv.monto_cobro||"Cobro pendiente"}</p>}
                            {conv.derivada && <p className="text-xs mt-0.5" style={{color:"#f97316"}}>⚡ Con equipo</p>}
                          </div>
                        );
                      })}
                      {contactos.length === 0 && (
                        <div className={`text-center py-6 text-xs text-gray-400 rounded-lg border-2 border-dashed ${isDragTarget?"border-gray-400":"border-gray-200"}`}>
                          {isDragTarget ? "Soltar aquí" : "Sin contactos"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== DASHBOARD ===== */}
        {vista === "dashboard" && (
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-lg font-black text-gray-800 mb-5">Dashboard</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                {label:"Total contactos",value:stats.total,icon:"👥",color:PRIMARY},
                {label:"Leads calientes",value:stats.calientes,icon:"🔥",color:"#ef4444"},
                {label:"Con equipo",value:stats.derivados,icon:"⚡",color:"#f97316"},
                {label:"Cobro pendiente",value:stats.cobroPendiente,icon:"💰",color:"#dc2626"},
              ].map(k=>(
                <div key={k.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <p className="text-2xl mb-1">{k.icon}</p>
                  <p className="text-3xl font-black" style={{color:k.color}}>{k.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{k.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
              <h3 className="font-bold text-gray-800 text-sm mb-4">Contactos por etapa</h3>
              <div className="space-y-3">
                {stats.porEtapa.map(({etapa,count})=>{
                  const col=ETAPA_COLORS[etapa];
                  const pct=stats.total>0?Math.round((count/stats.total)*100):0;
                  return(
                    <div key={etapa} className="flex items-center gap-3">
                      <div className="w-24 text-xs font-medium text-gray-600 text-right">{ETAPA_LABELS[etapa]}</div>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full flex items-center px-2 ${col.dot.replace("bg-","bg-")}`}
                          style={{width:`${Math.max(pct,3)}%`,minWidth:count>0?"2rem":"0"}}>
                          {count>0&&<span className="text-white text-xs font-bold">{count}</span>}
                        </div>
                      </div>
                      <div className="w-10 text-xs text-gray-400 text-right">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
              <h3 className="font-bold text-gray-800 text-sm mb-4">🔥 Leads más calientes</h3>
              <div className="space-y-2">
                {[...conversaciones].sort((a,b)=>calcularScore(b)-calcularScore(a)).slice(0,8).map(conv=>{
                  const score=calcularScore(conv);const temp=getTemp(score);
                  return(
                    <div key={conv.telefono} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition"
                      onClick={()=>{setVista("lista");abrirChat(conv.telefono);}}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:PRIMARY}}>
                        {getInitial(conv.nombre,conv.telefono)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{getDisplayName(conv.nombre,conv.telefono)}</p>
                        <p className="text-xs text-gray-400">{ETAPA_LABELS[conv.etapa]}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${score}%`,backgroundColor:temp.color}}/>
                        </div>
                        <span className="text-xs font-bold w-8 text-right" style={{color:temp.color}}>{score}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {stats.cobroPendiente>0&&(
              <div className="bg-red-50 rounded-2xl p-5 shadow-sm border border-red-100">
                <h3 className="font-bold text-red-700 text-sm mb-4">💰 Cobros pendientes ({stats.cobroPendiente})</h3>
                <div className="space-y-2">
                  {conversaciones.filter(c=>c.cobro_pendiente).map(conv=>(
                    <div key={conv.telefono} className="flex items-center gap-3 p-2.5 bg-white rounded-xl cursor-pointer hover:shadow-sm transition"
                      onClick={()=>{setVista("lista");abrirChat(conv.telefono);}}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{backgroundColor:"#dc2626"}}>
                        {getInitial(conv.nombre,conv.telefono)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{getDisplayName(conv.nombre,conv.telefono)}</p>
                        <p className="text-xs text-red-500 font-medium">{conv.monto_cobro||"Monto no especificado"}</p>
                      </div>
                      <span className="text-xs text-gray-400">{ETAPA_LABELS[conv.etapa]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
