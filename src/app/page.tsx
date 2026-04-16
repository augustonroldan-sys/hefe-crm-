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

function tiempoRelativo(fecha: string): string {
  if (!fecha) return "";
  const diff = Math.floor((Date.now() - new Date(fecha + "Z").getTime()) / 1000);
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return "ayer";
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
  return new Date(fecha + "Z").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

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
  contacto_existente: boolean; archivada: boolean; actualizado: string; ultimo_mensaje: string; ultimo_rol: string;
}
interface StatsSofia {
  total_mensajes_sofia: number; total_mensajes_clientes: number;
  conversaciones_con_respuesta: number; total_conversaciones: number;
  tasa_respuesta: number; mensajes_por_dia: { fecha: string; sofia: number; clientes: number }[];
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
  const [seguimientoActivo, setSeguimientoActivo] = useState(false);
  const [seguimientoDias, setSeguimientoDias] = useState("2");
  const [seguimientoMensaje, setSeguimientoMensaje] = useState("");
  const [savingSeguimiento, setSavingSeguimiento] = useState(false);
  const [forzandoSeguimiento, setForzandoSeguimiento] = useState(false);
  const [seguimientoResultado, setSeguimientoResultado] = useState<string|null>(null);
  const [plantillas, setPlantillas] = useState<{id:string;titulo:string;texto:string}[]>([]);
  const [showPlantillas, setShowPlantillas] = useState(false);
  const [nuevaPlantillaTitulo, setNuevaPlantillaTitulo] = useState("");
  const [nuevaPlantillaTexto, setNuevaPlantillaTexto] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [filtroChat, setFiltroChat] = useState<"todos"|"derivados"|"cobro"|string>("todos");
  // Chat features
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<Mensaje|null>(null);
  const [archivoPreview, setArchivoPreview] = useState<ArchivoPreview|null>(null);
  const [msgHover, setMsgHover] = useState<number|null>(null);
  const [showReactions, setShowReactions] = useState<number|null>(null);
  const [editandoIdx, setEditandoIdx] = useState<number|null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [showNotas, setShowNotas] = useState(false);
  const [notas, setNotas] = useState("");
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const [showBusqueda, setShowBusqueda] = useState(false);
  const [busquedaChat, setBusquedaChat] = useState("");
  const [busquedaIdx, setBusquedaIdx] = useState(0);
  const [generandoResumen, setGenerandoResumen] = useState(false);
  const [mostrarArchivadas, setMostrarArchivadas] = useState(false);
  const [statsSofia, setStatsSofia] = useState<StatsSofia | null>(null);
  const [resyncVozCorriendo, setResyncVozCorriendo] = useState(false);
  const busquedaRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prevUltimosMsgs = useRef<Map<string, string>>(new Map());
  const notifPermission = useRef(false);
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
      const res = await fetch(`${SOFIA_URL}/api/conversaciones?x_password=${password}&incluir_archivadas=false`);
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
      setSeguimientoActivo(data.seguimiento_activo === "true");
      setSeguimientoDias(data.seguimiento_dias || "2");
      setSeguimientoMensaje(data.seguimiento_mensaje || "Hola! Quería saber si pudiste ver la información que te mandé. ¿Puedo ayudarte con algo más? 😊");
      try { setPlantillas(JSON.parse(data.plantillas || "[]")); } catch {}
    } catch {}
  }

  async function guardarPlantillas(lista: {id:string;titulo:string;texto:string}[]) {
    setPlantillas(lista);
    await guardarConfig({ plantillas: JSON.stringify(lista) });
  }

  function agregarPlantilla() {
    if (!nuevaPlantillaTitulo.trim() || !nuevaPlantillaTexto.trim()) return;
    const nueva = { id: Date.now().toString(), titulo: nuevaPlantillaTitulo.trim(), texto: nuevaPlantillaTexto.trim() };
    guardarPlantillas([...plantillas, nueva]);
    setNuevaPlantillaTitulo(""); setNuevaPlantillaTexto("");
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

  async function guardarSeguimiento() {
    setSavingSeguimiento(true);
    await guardarConfig({
      seguimiento_activo: seguimientoActivo ? "true" : "false",
      seguimiento_dias: seguimientoDias,
      seguimiento_mensaje: seguimientoMensaje,
    });
    setSavingSeguimiento(false);
  }

  async function forzarSeguimiento() {
    setForzandoSeguimiento(true);
    setSeguimientoResultado(null);
    try {
      const res = await fetch(`${SOFIA_URL}/seguimiento/forzar?x_password=${password}`, { method: "POST" });
      const data = await res.json();
      if (data.status === "desactivado") {
        setSeguimientoResultado("Activá el seguimiento primero");
      } else {
        setSeguimientoResultado(data.enviados === 0 ? "Ningún contacto necesita seguimiento ahora" : `✓ Enviado a ${data.enviados} contacto${data.enviados !== 1 ? "s" : ""}`);
      }
    } catch {
      setSeguimientoResultado("Error al forzar seguimiento");
    }
    setForzandoSeguimiento(false);
  }

  async function toggleSofia(telefono: string, pausar: boolean) {
    const endpoint = pausar ? "pausar" : "reactivar";
    await fetch(`${SOFIA_URL}/${endpoint}/${telefono}?x_password=${password}`, { method: "POST" });
    setConversaciones(prev => prev.map(c => c.telefono === telefono ? { ...c, derivada: pausar } : c));
  }

  const cargarConversaciones = useCallback(async () => {
    try {
      const url = `${SOFIA_URL}/api/conversaciones?x_password=${password}&incluir_archivadas=${mostrarArchivadas}`;
      const res = await fetch(url);
      const data: Conversacion[] = await res.json();
      setConversaciones(data);

      // Detectar mensajes nuevos del cliente para notificaciones
      let nuevos = 0;
      for (const conv of data) {
        const prevMsg = prevUltimosMsgs.current.get(conv.telefono);
        const esNuevoMsgCliente = conv.ultimo_rol === "user" && conv.ultimo_mensaje;
        if (esNuevoMsgCliente && prevMsg !== undefined && prevMsg !== conv.ultimo_mensaje) {
          nuevos++;
          // Sonido de notificación
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
          } catch {}
          // Notificación del navegador
          if (notifPermission.current && document.hidden) {
            const nombre = getDisplayName(conv.nombre, conv.telefono);
            new Notification(`💬 ${nombre}`, {
              body: conv.ultimo_mensaje.slice(0, 100),
              icon: "/logo.jpg",
              tag: conv.telefono,
            });
          }
        }
        prevUltimosMsgs.current.set(conv.telefono, conv.ultimo_mensaje || "");
      }

      // Actualizar badge en el título de la pestaña
      if (nuevos > 0) {
        setUnreadCount(c => c + nuevos);
      }
    } catch {}
  }, [password, mostrarArchivadas]);

  async function abrirChat(telefono: string) {
    setSeleccionada(telefono);
    setReplyTo(null); setArchivoPreview(null); setShowEmoji(false); setShowNotas(false);
    const [chatRes, notasRes] = await Promise.all([
      fetch(`${SOFIA_URL}/api/conversaciones/${telefono}?x_password=${password}`),
      fetch(`${SOFIA_URL}/api/conversaciones/${telefono}/notas?x_password=${password}`),
    ]);
    const chatData = await chatRes.json();
    const notasData = await notasRes.json();
    setHistorial(chatData.mensajes || []);
    setNotas(notasData.notas || "");
  }

  async function guardarNotasChat() {
    if (!seleccionada) return;
    setGuardandoNotas(true);
    await fetch(`${SOFIA_URL}/api/conversaciones/${seleccionada}/notas?x_password=${password}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notas }),
    });
    setGuardandoNotas(false);
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

  async function generarResumenIA() {
    if (!seleccionada) return;
    setGenerandoResumen(true);
    try {
      const res = await fetch(`${SOFIA_URL}/api/conversaciones/${seleccionada}/resumen?x_password=${password}`, { method: "POST" });
      const data = await res.json();
      if (data.resumen) {
        setConversaciones(prev => prev.map(c => c.telefono === seleccionada ? { ...c, resumen: data.resumen } : c));
      }
    } finally { setGenerandoResumen(false); }
  }

  async function archivarChat(telefono: string, archivar: boolean) {
    const endpoint = archivar ? "archivar" : "desarchivar";
    await fetch(`${SOFIA_URL}/api/conversaciones/${telefono}/${endpoint}?x_password=${password}`, { method: "POST" });
    setConversaciones(prev => prev.map(c => c.telefono === telefono ? { ...c, archivada: archivar } : c));
    if (archivar && seleccionada === telefono) setSeleccionada(null);
  }

  async function cargarStatsSofia() {
    try {
      const res = await fetch(`${SOFIA_URL}/api/stats/sofia?x_password=${password}`);
      setStatsSofia(await res.json());
    } catch {}
  }

  async function resyncAudios() {
    setResyncVozCorriendo(true);
    try {
      await fetch(`${SOFIA_URL}/resync-audios?x_password=${password}`, { method: "POST" });
      let done = false;
      for (let i = 0; i < 30 && !done; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const r = await fetch(`${SOFIA_URL}/resync-audios/estado?x_password=${password}`);
        const d = await r.json();
        if (!d.corriendo) done = true;
      }
      if (seleccionada) await abrirChat(seleccionada);
    } finally { setResyncVozCorriendo(false); }
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
      conversaciones.forEach(c => prevUltimosMsgs.current.set(c.telefono, c.ultimo_mensaje || ""));
      if ("Notification" in window) {
        Notification.requestPermission().then(p => { notifPermission.current = p === "granted"; });
      }
      const iv = setInterval(cargarConversaciones, 10000);
      return () => clearInterval(iv);
    }
  }, [autenticado, cargarConversaciones]);

  useEffect(() => {
    if (autenticado && vista === "dashboard") cargarStatsSofia();
  }, [autenticado, vista]); // eslint-disable-line

  // Badge en el título de la pestaña
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) HeFe CRM`;
    } else {
      document.title = "HeFe CRM";
    }
  }, [unreadCount]);

  // Limpiar badge cuando el usuario abre un chat
  function abrirChatConLimpiarBadge(telefono: string) {
    setUnreadCount(0);
    document.title = "HeFe CRM";
    abrirChat(telefono);
  }

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [historial]);

  // Índices de mensajes que coinciden con la búsqueda
  const resultadosBusqueda = busquedaChat.trim().length >= 2
    ? historial.reduce<number[]>((acc, msg, i) => {
        if (msg.content.toLowerCase().includes(busquedaChat.toLowerCase())) acc.push(i);
        return acc;
      }, [])
    : [];

  // Scroll al resultado activo
  useEffect(() => {
    if (resultadosBusqueda.length === 0) return;
    const el = document.getElementById(`msg-${resultadosBusqueda[busquedaIdx]}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [busquedaIdx, busquedaChat]); // eslint-disable-line

  function abrirBusquedaChat() {
    setShowBusqueda(true);
    setBusquedaChat("");
    setBusquedaIdx(0);
    setTimeout(() => busquedaRef.current?.focus(), 50);
  }

  function cerrarBusquedaChat() {
    setShowBusqueda(false);
    setBusquedaChat("");
    setBusquedaIdx(0);
  }

  const convFiltradas = conversaciones.filter(c => {
    const n = getDisplayName(c.nombre, c.telefono).toLowerCase();
    const coincideBusqueda = n.includes(busqueda.toLowerCase()) || c.telefono.includes(busqueda);
    if (!coincideBusqueda) return false;
    if (filtroChat === "derivados") return c.derivada;
    if (filtroChat === "cobro") return c.cobro_pendiente;
    if (filtroChat !== "todos") return c.etapa === filtroChat;
    return true;
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
    // Imagen: [Imagen](media_id_o_url)
    const imgMatch = content.match(/^\[Imagen\]\((.+?)\)(.*)?$/);
    // Video: [Video](media_id_o_url)
    const vidMatch = content.match(/^\[Video\]\((.+?)\)(.*)?$/);
    // Audio: [Audio](media_id)
    const audioMatch = content.match(/^\[Audio\]\((.+?)\)$/);
    // Extraer media_id de una URL de Whapi o usar directo
    const toProxyUrl = (idOrUrl: string) => {
      const id = idOrUrl.startsWith("http")
        ? (idOrUrl.match(/\/media\/([^?/]+)/)?.[1] ?? idOrUrl)
        : idOrUrl;
      return `${SOFIA_URL}/api/media/${id}?x_password=${password}`;
    };
    const esImagen = content.startsWith("[Imagen") && !imgMatch;
    const esAudio = content === "[voz]" || (content.startsWith("[Audio") && !audioMatch);
    const esVideo = content.startsWith("[Video") && !vidMatch;
    const esSticker = content.startsWith("[Sticker");
    const isHovered = msgHover === i;
    const isEditing = editandoIdx === i;
    const isBusquedaMatch = busquedaChat.trim().length >= 2 && content.toLowerCase().includes(busquedaChat.toLowerCase());
    const isBusquedaActivo = isBusquedaMatch && resultadosBusqueda[busquedaIdx] === i;

    return (
      <div
        key={i}
        id={`msg-${i}`}
        className={`flex ${esUser ? "justify-start" : "justify-end"} group`}
        onMouseEnter={() => setMsgHover(i)}
        onMouseLeave={() => { setMsgHover(null); setShowReactions(null); }}
        style={isBusquedaActivo ? { backgroundColor: "#fef08a", borderRadius: "12px", margin: "2px -4px", padding: "0 4px" }
              : isBusquedaMatch ? { backgroundColor: "#fefce8", borderRadius: "12px", margin: "2px -4px", padding: "0 4px" }
              : {}}
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
                    <a href={toProxyUrl(imgMatch[1])} target="_blank" rel="noopener noreferrer">
                      <img src={toProxyUrl(imgMatch[1])} alt="Imagen"
                        className="rounded-xl max-w-full object-cover cursor-pointer hover:opacity-90 transition"
                        style={{maxHeight:"200px", maxWidth:"240px"}}
                        onError={e => { (e.target as HTMLImageElement).style.display="none"; }}
                      />
                    </a>
                    {imgMatch[2]?.trim() && <span className="text-xs opacity-80">{imgMatch[2].trim()}</span>}
                  </div>
                ) : vidMatch ? (
                  <div className="flex flex-col gap-1">
                    <a href={toProxyUrl(vidMatch[1])} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:opacity-80 transition"
                      style={{backgroundColor: esUser ? "#f3f4f6" : "rgba(255,255,255,0.15)"}}>
                      <span className="text-2xl">🎥</span>
                      <span className="text-xs font-medium">Ver video ↗</span>
                    </a>
                    {vidMatch[2]?.trim() && <span className="text-xs opacity-80">{vidMatch[2].trim()}</span>}
                  </div>
                ) :docMatch ? (
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
                ) : audioMatch ? (
                  <div className="flex flex-col gap-1" style={{minWidth:"200px"}}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🎙️</span>
                      <span className="text-xs font-medium opacity-70">Audio</span>
                    </div>
                    <audio
                      controls
                      src={toProxyUrl(audioMatch[1])}
                      style={{height:"32px", width:"100%"}}
                    >
                      Tu navegador no soporta audio
                    </audio>
                  </div>
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
            <div className="relative">
              <input
                type={mostrarPassword ? "text" : "password"}
                placeholder="Contraseña"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&login()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-lg select-none"
                tabIndex={-1}
              >
                {mostrarPassword ? "🙈" : "👁️"}
              </button>
            </div>
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

            {/* Plantillas */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-700 mb-3">⚡ Plantillas de respuesta rápida</p>
              <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto">
                {plantillas.length === 0 && <p className="text-xs text-gray-400">Sin plantillas todavía</p>}
                {plantillas.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700">{p.titulo}</p>
                      <p className="text-xs text-gray-400 truncate">{p.texto}</p>
                    </div>
                    <button onClick={()=>guardarPlantillas(plantillas.filter(x=>x.id!==p.id))}
                      className="text-red-400 hover:text-red-600 text-sm flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
              <input value={nuevaPlantillaTitulo} onChange={e=>setNuevaPlantillaTitulo(e.target.value)}
                placeholder="Nombre (ej: Presupuesto)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none mb-1.5"/>
              <textarea value={nuevaPlantillaTexto} onChange={e=>setNuevaPlantillaTexto(e.target.value)}
                placeholder="Texto del mensaje..." rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none resize-none mb-2"/>
              <button onClick={agregarPlantilla} disabled={!nuevaPlantillaTitulo.trim()||!nuevaPlantillaTexto.trim()}
                className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                style={{backgroundColor:PRIMARY}}>+ Agregar plantilla</button>
            </div>

            {/* Seguimiento automático */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-700">🔔 Seguimiento automático</p>
                <button
                  onClick={() => { setSeguimientoActivo(v => !v); }}
                  className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
                  style={{ backgroundColor: seguimientoActivo ? PRIMARY : "#d1d5db" }}
                >
                  <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                    style={{ left: seguimientoActivo ? "22px" : "2px" }} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-3">Sofia manda un mensaje si el cliente no respondió en X días</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-600">Después de</span>
                <input
                  type="number" min="1" max="14" value={seguimientoDias}
                  onChange={e => setSeguimientoDias(e.target.value)}
                  className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none"
                />
                <span className="text-xs text-gray-600">días sin respuesta</span>
              </div>
              <textarea
                value={seguimientoMensaje}
                onChange={e => setSeguimientoMensaje(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none resize-none mb-2"
                placeholder="Mensaje de seguimiento..."
              />
              <div className="flex gap-2">
                <button
                  onClick={guardarSeguimiento} disabled={savingSeguimiento}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {savingSeguimiento ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={forzarSeguimiento} disabled={forzandoSeguimiento}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                >
                  {forzandoSeguimiento ? "Enviando..." : "▶ Forzar ahora"}
                </button>
              </div>
              {seguimientoResultado && (
                <p className="text-xs mt-2 text-center font-medium" style={{ color: PRIMARY }}>{seguimientoResultado}</p>
              )}
            </div>

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
          <button onClick={resyncAudios} disabled={resyncVozCorriendo}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition disabled:opacity-50"
            title="Re-sincronizar audios viejos [voz]">
            {resyncVozCorriendo ? "🔊 ..." : "🔊 Fix audios"}
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
                {/* Filtros rápidos */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {[
                    { key: "todos",     label: "Todos" },
                    { key: "derivados", label: "⚡ Equipo" },
                    { key: "cobro",     label: "💰 Cobro" },
                  ].map(f => (
                    <button key={f.key} onClick={() => setFiltroChat(f.key)}
                      className="px-2 py-0.5 rounded-full text-xs font-medium transition"
                      style={filtroChat === f.key
                        ? { backgroundColor: PRIMARY, color: "white" }
                        : { backgroundColor: "#f3f4f6", color: "#6b7280" }
                      }>
                      {f.label}
                    </button>
                  ))}
                  <select value={ETAPAS.includes(filtroChat) ? filtroChat : ""}
                    onChange={e => setFiltroChat(e.target.value || "todos")}
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 focus:outline-none cursor-pointer"
                    style={ETAPAS.includes(filtroChat) ? { backgroundColor: PRIMARY, color: "white" } : {}}>
                    <option value="">Etapa...</option>
                    {ETAPAS.map(e => <option key={e} value={e}>{ETAPA_LABELS[e]}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <p className="text-xs text-gray-400">{convFiltradas.length} conversaciones</p>
                  <button
                    onClick={() => { setMostrarArchivadas(v => !v); cargarConversaciones(); }}
                    className="text-xs font-medium transition"
                    style={{ color: mostrarArchivadas ? PRIMARY : "#9ca3af" }}
                    title={mostrarArchivadas ? "Ocultar archivadas" : "Mostrar archivadas"}
                  >{mostrarArchivadas ? "📂 Archivadas" : "📦 Archivadas"}</button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                {convFiltradas.map(conv => {
                  const ec = ETAPA_COLORS[conv.etapa]||ETAPA_COLORS.nuevo;
                  const nombre = getDisplayName(conv.nombre,conv.telefono);
                  const activa = seleccionada === conv.telefono;
                  const temp = getTemp(calcularScore(conv));
                  return (
                    <div key={conv.telefono} onClick={()=>abrirChatConLimpiarBadge(conv.telefono)}
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
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-1">{tiempoRelativo(conv.actualizado)}</span>
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
                        {/* Resumen IA */}
                        <button
                          onClick={generarResumenIA}
                          disabled={generandoResumen}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-500 hover:bg-gray-200 transition disabled:opacity-50"
                          title="Generar resumen IA"
                        >{generandoResumen ? "✨ ..." : "✨ Resumir"}</button>

                        {/* Archivar */}
                        <button
                          onClick={() => archivarChat(seleccionada!, !convSeleccionada.archivada)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold transition"
                          style={convSeleccionada.archivada
                            ? { backgroundColor: "#f3f4f6", color: "#6b7280" }
                            : { backgroundColor: "#f3f4f6", color: "#6b7280" }
                          }
                          title={convSeleccionada.archivada ? "Desarchivar" : "Archivar conversación"}
                        >{convSeleccionada.archivada ? "📂 Desarchivar" : "📦 Archivar"}</button>

                        {/* Buscar en el chat */}
                        <button
                          onClick={abrirBusquedaChat}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
                          title="Buscar en el chat"
                        >🔍</button>

                        {/* Notas privadas */}
                        <button
                          onClick={() => setShowNotas(!showNotas)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition"
                          style={showNotas
                            ? { backgroundColor: "#fef9c3", color: "#ca8a04" }
                            : { backgroundColor: "#f3f4f6", color: "#6b7280" }
                          }
                          title="Notas privadas"
                        >
                          📝 {notas ? "Notas ●" : "Notas"}
                        </button>

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

                  {/* Barra de búsqueda */}
                  {showBusqueda && (
                    <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
                      <span className="text-gray-400 text-sm">🔍</span>
                      <input
                        ref={busquedaRef}
                        value={busquedaChat}
                        onChange={e => { setBusquedaChat(e.target.value); setBusquedaIdx(0); }}
                        onKeyDown={e => {
                          if (e.key === "Escape") cerrarBusquedaChat();
                          if (e.key === "Enter" && resultadosBusqueda.length > 0)
                            setBusquedaIdx(i => (i + 1) % resultadosBusqueda.length);
                        }}
                        placeholder="Buscar en la conversación..."
                        className="flex-1 text-sm focus:outline-none"
                      />
                      {busquedaChat.trim().length >= 2 && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {resultadosBusqueda.length === 0
                            ? "Sin resultados"
                            : `${busquedaIdx + 1} / ${resultadosBusqueda.length}`}
                        </span>
                      )}
                      {resultadosBusqueda.length > 1 && (
                        <>
                          <button onClick={() => setBusquedaIdx(i => (i - 1 + resultadosBusqueda.length) % resultadosBusqueda.length)}
                            className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs flex items-center justify-center">↑</button>
                          <button onClick={() => setBusquedaIdx(i => (i + 1) % resultadosBusqueda.length)}
                            className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs flex items-center justify-center">↓</button>
                        </>
                      )}
                      <button onClick={cerrarBusquedaChat} className="text-gray-400 hover:text-gray-600 text-sm ml-1">✕</button>
                    </div>
                  )}

                  {/* Contenedor mensajes + notas */}
                  <div className="flex flex-1 overflow-hidden">

                  {/* Messages */}
                  <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-2" style={{backgroundColor:"#f0f4f3"}}>
                    {historial.length === 0
                      ? <div className="flex items-center justify-center h-full text-gray-400 text-sm">Sin mensajes todavía</div>
                      : historial.map((msg,i) => renderMensaje(msg,i))
                    }
                  </div>

                  </div>{/* fin messages */}

                  {/* Panel notas */}
                  {showNotas && (
                    <div className="w-64 flex-shrink-0 border-l border-gray-100 bg-white flex flex-col">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700">📝 Notas privadas</span>
                        <button onClick={() => setShowNotas(false)} className="text-gray-400 hover:text-gray-600 text-base">✕</button>
                      </div>
                      <textarea
                        value={notas}
                        onChange={e => setNotas(e.target.value)}
                        placeholder="Escribí notas internas sobre este cliente...&#10;&#10;El cliente no ve esto."
                        className="flex-1 resize-none p-4 text-xs text-gray-700 focus:outline-none"
                        style={{ lineHeight: "1.6" }}
                      />
                      <div className="px-4 py-3 border-t border-gray-100">
                        <button
                          onClick={guardarNotasChat}
                          disabled={guardandoNotas}
                          className="w-full py-2 rounded-xl text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          {guardandoNotas ? "Guardando..." : "Guardar notas"}
                        </button>
                        <p className="text-xs text-gray-400 mt-1.5 text-center">Solo visible para vos</p>
                      </div>
                    </div>
                  )}

                  </div>{/* fin contenedor mensajes+notas */}

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

                      {/* Plantillas */}
                      {plantillas.length > 0 && (
                        <div className="relative">
                          <button onClick={()=>setShowPlantillas(!showPlantillas)}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm hover:bg-gray-100 transition flex-shrink-0 font-bold"
                            style={{color:PRIMARY}} title="Plantillas de respuesta">
                            ⚡
                          </button>
                          {showPlantillas && (
                            <div className="absolute bottom-12 left-0 bg-white rounded-2xl shadow-2xl border border-gray-100 z-20 overflow-hidden" style={{width:"260px"}}>
                              <p className="text-xs font-bold text-gray-500 px-3 pt-3 pb-2">Plantillas rápidas</p>
                              {plantillas.map(p => (
                                <button key={p.id}
                                  onClick={()=>{ setTexto(p.texto); setShowPlantillas(false); inputRef.current?.focus(); }}
                                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition border-t border-gray-50">
                                  <p className="text-xs font-semibold text-gray-800">{p.titulo}</p>
                                  <p className="text-xs text-gray-400 truncate mt-0.5">{p.texto}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

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
                            onClick={()=>{setVista("lista");abrirChatConLimpiarBadge(conv.telefono);}}>
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
                      onClick={()=>{setVista("lista");abrirChatConLimpiarBadge(conv.telefono);}}>
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
            {/* Estadísticas de Sofia */}
            {statsSofia && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
                <h3 className="font-bold text-gray-800 text-sm mb-4">🤖 Estadísticas de Sofia</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "Mensajes enviados", value: statsSofia.total_mensajes_sofia, icon: "💬", color: PRIMARY },
                    { label: "Mensajes recibidos", value: statsSofia.total_mensajes_clientes, icon: "📩", color: "#6366f1" },
                    { label: "Convs. respondidas", value: statsSofia.conversaciones_con_respuesta, icon: "✅", color: "#10b981" },
                    { label: "Tasa de respuesta", value: `${statsSofia.tasa_respuesta}%`, icon: "📊", color: "#f59e0b" },
                  ].map(k => (
                    <div key={k.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-lg mb-0.5">{k.icon}</p>
                      <p className="text-xl font-black" style={{ color: k.color }}>{k.value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                    </div>
                  ))}
                </div>
                {/* Mensajes por día — últimos 7 días */}
                <p className="text-xs font-semibold text-gray-500 mb-2">Actividad últimos 7 días</p>
                <div className="flex items-end gap-1.5 h-20">
                  {statsSofia.mensajes_por_dia.map(d => {
                    const total = d.sofia + d.clientes;
                    const maxTotal = Math.max(...statsSofia.mensajes_por_dia.map(x => x.sofia + x.clientes), 1);
                    const pct = Math.round((total / maxTotal) * 100);
                    const label = d.fecha.slice(5); // MM-DD
                    return (
                      <div key={d.fecha} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-xs text-gray-400">{total > 0 ? total : ""}</span>
                        <div className="w-full rounded-t-lg overflow-hidden flex flex-col" style={{ height: `${Math.max(pct, 4)}%` }}>
                          <div className="flex-1" style={{ backgroundColor: PRIMARY, opacity: 0.85 }} title={`Sofia: ${d.sofia}`} />
                        </div>
                        <span className="text-xs text-gray-400" style={{ fontSize: "9px" }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: PRIMARY }}/>
                    Sofia
                  </span>
                  <button onClick={cargarStatsSofia} className="ml-auto text-xs text-gray-400 hover:text-gray-600">↻ Actualizar</button>
                </div>
              </div>
            )}

            {stats.cobroPendiente>0&&(
              <div className="bg-red-50 rounded-2xl p-5 shadow-sm border border-red-100">
                <h3 className="font-bold text-red-700 text-sm mb-4">💰 Cobros pendientes ({stats.cobroPendiente})</h3>
                <div className="space-y-2">
                  {conversaciones.filter(c=>c.cobro_pendiente).map(conv=>(
                    <div key={conv.telefono} className="flex items-center gap-3 p-2.5 bg-white rounded-xl cursor-pointer hover:shadow-sm transition"
                      onClick={()=>{setVista("lista");abrirChatConLimpiarBadge(conv.telefono);}}>
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
