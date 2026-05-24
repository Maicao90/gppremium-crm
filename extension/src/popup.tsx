import "~style.css"

function IndexPopup() {
  return (
    <div className="w-64 p-4 flex flex-col items-center bg-white" style={{fontFamily: 'Inter, sans-serif'}}>
      <div className="w-40 h-16 flex items-center justify-center overflow-hidden mb-3">
        <img 
          src={chrome.runtime.getURL("assets/logo.jpg")} 
          alt="GP Pneus Logo" 
          className="w-full h-full object-contain"
        />
      </div>
      <h1 className="text-lg font-bold text-gray-800 mb-1">WhatsApp CRM</h1>
      <p className="text-xs text-gray-500 text-center mb-4">
        A sua ferramenta de agendamentos e follow-up diretamente no WhatsApp.
      </p>
      
      <a 
        href="https://web.whatsapp.com/" 
        target="_blank" 
        className="w-full bg-[#00a884] text-white py-2 rounded-lg font-bold hover:bg-[#008f6f] transition text-center shadow-sm"
      >
        Abrir WhatsApp Web
      </a>
      
      <div className="mt-4 pt-3 border-t border-gray-100 w-full text-center">
        <span className="text-[10px] text-gray-400 font-bold">CRM NATIVO ATIVO</span>
      </div>
    </div>
  )
}

export default IndexPopup
