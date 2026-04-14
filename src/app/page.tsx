"use client";
import { useState, useEffect } from "react";

const SOFIA_URL = process.env.NEXT_PUBLIC_SOFIA_URL || "https://whatsapp-agentkit-production-6718.up.railway.app";

const ETAPAS = ["nuevo", "respondio", "interesado", "presupuesto", "seguimiento", "cerrado"];
const ETAPA_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  respondio: "Respondió",
  interesado: "Interesado",
  presupuesto: "Presupuesto",
  seguimiento: "Seguimiento",
  cerrado: "Cerrado",
};
const ETAPA_COLORS: Record<string, string> = {
  nuevo: "bg-gray-100 text-gray-700",
  respondio: "bg-blue-100 text-blue-700",
  interesado: "bg-yellow-100 text-yellow-700",
  presupuesto: "bg-orange-100 text-orange-700",
  seguimiento: "bg-purple-100 text-purple-700",
  cerrado: "bg-green-100 text-green-700",
};

interface Conversacion {
  telefono: string;
  nombre: string;
  etapa: string;
  derivada: boolean;
  actualizado: string;
  ultimo_mensaje: string;
  ultimo_rol: string;
}

interface Mensaje {
  role: string;
  content: string;
}

export default function Home() {
  const [password, setPassword] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Mensaje[]>([]);
  const [vista, setVista] = useState<"lista" | "pipeline">("lista");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [mensajeManual, setMensajeManual] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function login() {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`${SOFIA_URL}/api/conversaciones?x_password=${password}`);
      if (res.status === 401) { setError("Contraseña incorrecta"); setCargando(false); return; }
      const data = await res.json();
      setConversaciones(data);
      setAutenticado(true);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setCargando(false);
    }
  }

  async function cargarConversaciones() {
    try {
      const res = await fetch(`${SOFIA_URL}/api/conversaciones?x_password=${password}`);
      const data = await res.json();
      setConversaciones(data);
    } catch {}
  }

  async function abrirChat(telefono: string) {
    setSeleccionada(telefono);
    const res = await fetch(`${SOFIA_URL}/api/conversaciones/${telefono}?x_password=${password}`);
    const data = await res.json();
    setHistorial(data.mensajes);
  }

  async function enviarMensaje() {
    if (!seleccionada || !mensajeManual.trim()) return;
    setEnviando(true);
    try {
      await fetch(`${SOFIA_URL}/api/conversaciones/${seleccionada}/enviar?x_password=${password}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: mensajeManual }),
      });
      setMensajeManual("");
      await abrirChat(seleccionada);
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarEtapa(telefono: string, etapa: string) {
    await fetch(`${SOFIA_URL}/api/conversaciones/${telefono}/etapa?x_password=${password}&etapa=${etapa}`, { method: "PUT" });
    await cargarConversaciones();
  }

  useEffect(() => {
    if (autenticado) {
      const interval = setInterval(cargarConversaciones, 15000);
      return () => clearInterval(interval);
    }
  }, [autenticado, password]);

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">👕</div>
            <h1 className="text-2xl font-bold text-gray-800">HeFe Uniformes</h1>
            <p className="text-gray-500 text-sm mt-1">Panel de Sofia</p>
          </div>
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <button
            onClick={login}
            disabled={cargando}
            className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {cargando ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👕</span>
          <div>
            <h1 className="font-bold text-gray-800">HeFe Uniformes</h1>
            <p className="text-xs text-gray-500">Panel de Sofia</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setVista("lista")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${vista === "lista" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            Conversaciones
          </button>
          <button
            onClick={() => setVista("pipeline")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${vista === "pipeline" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            Pipeline
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {vista === "lista" ? (
          <>
            <div className="w-80 bg-white border-r overflow-y-auto flex-shrink-0">
              <div className="p-4 border-b">
                <p className="text-sm text-gray-500">{conversaciones.length} conversaciones</p>
              </div>
              {conversaciones.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <p className="text-4xl mb-2">💬</p>
                  <p className="text-sm">Sin conversaciones todavía</p>
                </div>
              ) : (
                conversaciones.map(conv => (
                  <div
                    key={conv.telefono}
                    onClick={() => abrirChat(conv.telefono)}
                    className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition ${seleccionada === conv.telefono ? "bg-blue-50 border-l-4 border-l-blue-500" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-800 text-sm">{conv.nombre}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ETAPA_COLORS[conv.etapa] || "bg-gray-100"}`}>
                        {ETAPA_LABELS[conv.etapa] || conv.etapa}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{conv.ultimo_mensaje || "Sin mensajes"}</p>
                    {conv.derivada && <p className="text-xs text-orange-500 mt-1">⚡ Derivado a equipo</p>}
                  </div>
                ))
              )}
            </div>

            <div className="flex-1 flex flex-col">
              {seleccionada ? (
                <>
                  <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{conversaciones.find(c => c.telefono === seleccionada)?.nombre}</p>
                      <p className="text-xs text-gray-500">{seleccionada}</p>
                    </div>
                    <select
                      value={conversaciones.find(c => c.telefono === seleccionada)?.etapa || "nuevo"}
                      onChange={e => cambiarEtapa(seleccionada, e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                    >
                      {ETAPAS.map(e => <option key={e} value={e}>{ETAPA_LABELS[e]}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {historial.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${msg.role === "user" ? "bg-white border text-gray-800" : "bg-blue-600 text-white"}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white border-t px-4 py-3 flex gap-2">
                    <input
                      type="text"
                      value={mensajeManual}
                      onChange={e => setMensajeManual(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && enviarMensaje()}
                      placeholder="Escribí un mensaje como Fedra..."
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={enviarMensaje}
                      disabled={enviando || !mensajeManual.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {enviando ? "..." : "Enviar"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <p className="text-4xl mb-2">💬</p>
                    <p>Seleccioná una conversación</p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-x-auto p-6">
            <div className="flex gap-4 min-w-max">
              {ETAPAS.map(etapa => {
                const contactos = conversaciones.filter(c => c.etapa === etapa);
                return (
                  <div key={etapa} className="w-64 flex-shrink-0">
                    <div className={`rounded-t-xl px-4 py-2 font-semibold text-sm ${ETAPA_COLORS[etapa]}`}>
                      {ETAPA_LABELS[etapa]} ({contactos.length})
                    </div>
                    <div className="bg-gray-100 rounded-b-xl p-2 space-y-2 min-h-32">
                      {contactos.map(conv => (
                        <div
                          key={conv.telefono}
                          className="bg-white rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md transition"
                          onClick={() => { setVista("lista"); abrirChat(conv.telefono); }}
                        >
                          <p className="font-medium text-sm text-gray-800">{conv.nombre}</p>
                          <p className="text-xs text-gray-500 truncate mt-1">{conv.ultimo_mensaje}</p>
                          {conv.derivada && <p className="text-xs text-orange-500 mt-1">⚡ Con equipo</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
