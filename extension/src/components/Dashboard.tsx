import React, { useState } from 'react';

// Helper para converter data do backend para o formato local exigido por datetime-local
const formatToDatetimeLocal = (dateString: string) => {
  const d = new Date(dateString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function Dashboard({ agendamentos, onClose, contatosDisponiveis = [], onDelete, onEdit }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  // Filtra agendamentos com base na aba ativa
  const agendamentosFiltrados = agendamentos.filter(ag => {
    if (filtroStatus === "todos") return true;
    if (filtroStatus === "pendente") return ag.status === "pendente";
    if (filtroStatus === "enviado") return ag.status === "enviado";
    if (filtroStatus === "falhou") return ag.status === "falhou" || ag.status === "cancelado";
    return true;
  });
  
  // Estados para o formulário de edição inline
  const [editCliente, setEditCliente] = useState("");
  const [editNumero, setEditNumero] = useState("");
  const [editMensagem, setEditMensagem] = useState("");
  const [editEnviarEm, setEditEnviarEm] = useState("");
  const [editCancelarSeResponder, setEditCancelarSeResponder] = useState(true);

  const handleStartEdit = (ag: any) => {
    setEditingId(ag.id);
    setEditCliente(ag.cliente);
    setEditNumero(ag.numero);
    setEditMensagem(ag.mensagem);
    setEditEnviarEm(formatToDatetimeLocal(ag.enviarEm));
    setEditCancelarSeResponder(ag.cancelarSeResponder);
  };

  const handleSaveEdit = (id: string) => {
    if (!editCliente || !editNumero || !editMensagem || !editEnviarEm) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    
    onEdit(id, {
      cliente: editCliente,
      numero: editNumero.replace(/\D/g, ''),
      mensagem: editMensagem,
      enviarEm: new Date(editEnviarEm).toISOString(),
      cancelarSeResponder: editCancelarSeResponder
    });
    
    setEditingId(null);
  };

  const handleDeleteClick = (id: string) => {
    if (window.confirm("Tem certeza que deseja apagar esta mensagem do histórico?")) {
      onDelete(id);
    }
  };

  // Cálculos para badges das abas
  const totalTodos = agendamentos.length;
  const totalPendentes = agendamentos.filter(ag => ag.status === 'pendente').length;
  const totalEnviados = agendamentos.filter(ag => ag.status === 'enviado').length;
  const totalFalhas = agendamentos.filter(ag => ag.status === 'falhou' || ag.status === 'cancelado').length;

  return (
    <div 
      className="fixed inset-y-0 right-[60px] w-[380px] bg-[#f8f9fa] shadow-2xl border-l border-gray-200 flex flex-col z-[9999] transition-all duration-300 ease-in-out" 
      style={{fontFamily: 'Inter, sans-serif'}}
    >
      {/* Header do Painel */}
      <div className="bg-white border-b border-gray-100 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-[#0e46a3] to-[#e21b24] text-white p-1.5 rounded-lg shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </div>
          <div>
            <h2 className="text-base font-bold bg-gradient-to-r from-[#0e46a3] to-[#e21b24] bg-clip-text text-transparent leading-none">GPPREMIUM</h2>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Dashboard de Disparos</span>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition"
          title="Fechar Painel"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Barra de Abas de Filtro */}
      <div className="bg-white px-3 py-2 border-b border-gray-100 flex gap-1 justify-between select-none">
        <button
          onClick={() => setFiltroStatus("todos")}
          className={`flex-1 py-1.5 px-1 rounded-lg text-[11px] font-bold transition-all duration-200 flex items-center justify-center gap-1 border ${
            filtroStatus === "todos"
              ? "bg-[#0e46a3] text-white border-[#0e46a3] shadow-sm"
              : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100 hover:text-gray-800"
          }`}
        >
          <span>Todos</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
            filtroStatus === "todos" ? "bg-white/25 text-white" : "bg-gray-200 text-gray-500"
          }`}>{totalTodos}</span>
        </button>

        <button
          onClick={() => setFiltroStatus("pendente")}
          className={`flex-1 py-1.5 px-1 rounded-lg text-[11px] font-bold transition-all duration-200 flex items-center justify-center gap-1 border ${
            filtroStatus === "pendente"
              ? "bg-yellow-500 text-white border-yellow-500 shadow-sm"
              : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100 hover:text-gray-800"
          }`}
        >
          <span>Progr.</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
            filtroStatus === "pendente" ? "bg-white/25 text-white" : "bg-gray-200 text-gray-500"
          }`}>{totalPendentes}</span>
        </button>

        <button
          onClick={() => setFiltroStatus("enviado")}
          className={`flex-1 py-1.5 px-1 rounded-lg text-[11px] font-bold transition-all duration-200 flex items-center justify-center gap-1 border ${
            filtroStatus === "enviado"
              ? "bg-green-600 text-white border-green-600 shadow-sm"
              : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100 hover:text-gray-800"
          }`}
        >
          <span>Enviados</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
            filtroStatus === "enviado" ? "bg-white/25 text-white" : "bg-gray-200 text-gray-500"
          }`}>{totalEnviados}</span>
        </button>

        <button
          onClick={() => setFiltroStatus("falhou")}
          className={`flex-1 py-1.5 px-1 rounded-lg text-[11px] font-bold transition-all duration-200 flex items-center justify-center gap-1 border ${
            filtroStatus === "falhou"
              ? "bg-red-500 text-white border-red-500 shadow-sm"
              : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100 hover:text-gray-800"
          }`}
        >
          <span>Falhas</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
            filtroStatus === "falhou" ? "bg-white/25 text-white" : "bg-gray-200 text-gray-500"
          }`}>{totalFalhas}</span>
        </button>
      </div>
      
      {/* Lista de Agendamentos */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {agendamentosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="bg-gray-100 p-4 rounded-full text-gray-400 mb-3">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <h3 className="font-bold text-gray-700 text-sm">
              {filtroStatus === "todos" && "Nenhum agendamento ativo"}
              {filtroStatus === "pendente" && "Nenhum agendamento programado"}
              {filtroStatus === "enviado" && "Nenhuma mensagem enviada"}
              {filtroStatus === "falhou" && "Nenhuma falha registrada"}
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-[200px]">
              {filtroStatus === "todos" && "Seus agendamentos futuros e histórico de mensagens aparecerão aqui."}
              {filtroStatus === "pendente" && "Seus agendamentos futuros aparecerão aqui."}
              {filtroStatus === "enviado" && "O histórico de mensagens enviadas aparecerá aqui."}
              {filtroStatus === "falhou" && "O histórico de mensagens que falharam ou foram canceladas aparecerá aqui."}
            </p>
          </div>
        ) : (
          agendamentosFiltrados.map(ag => {
            if (editingId === ag.id) {
              return (
                <div key={ag.id} className="bg-white p-4 rounded-xl shadow-md border border-green-200 flex flex-col gap-3 transition">
                  <div className="text-xs font-bold text-[#00a884] uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span>✏️</span> Editar Agendamento
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {contatosDisponiveis && contatosDisponiveis.length > 0 && (
                      <div className="bg-green-50/50 p-2 rounded-lg border border-green-100 flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-[#00a884] uppercase tracking-wider flex items-center gap-1">
                          <span>📋</span> Selecionar Contato Ativo
                        </label>
                        <select
                          className="w-full border border-gray-200 bg-white p-1 rounded text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#00a884] cursor-pointer shadow-sm"
                          onChange={e => {
                            const val = e.target.value
                            if (val) {
                              const [num, nome] = val.split('|')
                              setEditNumero(num)
                              setEditCliente(nome)
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>-- Selecionar contato recente --</option>
                          {contatosDisponiveis.map((c: any, idx: number) => (
                            <option key={idx} value={`${c.numero}|${c.nome}`}>
                              👤 {c.nome} ({c.numero})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 block mb-0.5 uppercase tracking-wider">Nome do Cliente</label>
                      <input 
                        type="text" 
                        className="w-full border border-gray-200 p-2 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#00a884]"
                        value={editCliente}
                        onChange={(e) => setEditCliente(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 block mb-0.5 uppercase tracking-wider">Número</label>
                      <input 
                        type="text" 
                        className="w-full border border-gray-200 p-2 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#00a884]"
                        value={editNumero}
                        onChange={(e) => setEditNumero(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 block mb-0.5 uppercase tracking-wider">Mensagem</label>
                      <textarea 
                        className="w-full border border-gray-200 p-2 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-[#00a884] resize-none h-16 font-medium"
                        value={editMensagem}
                        onChange={(e) => setEditMensagem(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 block mb-0.5 uppercase tracking-wider">Enviar Em</label>
                      <input 
                        type="datetime-local" 
                        className="w-full border border-gray-200 p-2 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#00a884]"
                        value={editEnviarEm}
                        onChange={(e) => setEditEnviarEm(e.target.value)}
                        required
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <input 
                        type="checkbox" 
                        checked={editCancelarSeResponder}
                        onChange={(e) => setEditCancelarSeResponder(e.target.checked)}
                        className="w-4 h-4 accent-[#00a884] rounded"
                      />
                      <span className="text-[10px] font-bold text-gray-600">Pausar se responder</span>
                    </label>
                  </div>
                  
                  <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-gray-50">
                    <button 
                      type="button" 
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 transition"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleSaveEdit(ag.id)}
                      className="bg-[#00a884] hover:bg-[#008f6f] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={ag.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2.5 relative hover:border-gray-200 transition">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-gray-900">{ag.cliente}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider mt-1 w-max ${
                      ag.status === 'pendente' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                      ag.status === 'enviado' ? 'bg-green-50 text-green-700 border border-green-200' :
                      ag.status === 'cliente_respondeu' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {ag.status === 'pendente' ? 'Pendente' :
                       ag.status === 'enviado' ? 'Enviado' :
                       ag.status === 'cliente_respondeu' ? 'Respondido' :
                       'Falhou'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    {(ag.status === 'pendente' || ag.status === 'falhou' || ag.status === 'cliente_respondeu') && (
                      <button 
                        onClick={() => handleStartEdit(ag)}
                        className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition"
                        title="Editar Agendamento"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteClick(ag.id)}
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition"
                      title="Excluir Agendamento"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>
                </div>
                
                <div className="text-xs text-gray-500 flex items-center gap-1.5 font-medium">
                  <span>📞</span> {ag.numero}
                </div>

                <div className="text-xs bg-gray-50 p-3 rounded-lg text-gray-700 italic border-l-2 border-[#00a884] font-medium leading-relaxed break-words">
                  "{ag.mensagem}"
                </div>

                <div className="mt-1 pt-2.5 border-t border-gray-50 text-[10px] text-gray-400 flex justify-between font-semibold">
                  <span>👤 Atendente</span>
                  <span>📅 {new Date(ag.enviarEm).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

