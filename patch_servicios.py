import sys

file_path = "c:\\Users\\david.vasquez\\Documents\\personal\\lavanderia\\lavalatu-api\\frontend\\src\\components\\sections\\Servicios.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Imports
text = text.replace(
    "} from '../../services/servicios';",
    "} from '../../services/servicios';\nimport api from '../../services/api';"
)

# 2. State
text = text.replace(
    "const [editError, setEditError] = useState(null);",
    "const [editError, setEditError] = useState(null);\n  const [instituciones, setInstituciones] = useState([]);\n  const [institucionFiltro, setInstitucionFiltro] = useState('');\n  const [uploadingCsv, setUploadingCsv] = useState(false);\n  const fileInputRef = useRef(null);"
)

# 3. useEffect Mount
use_effect_old = """  useEffect(() => {
    fetchServices();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);"""

use_effect_new = """  useEffect(() => {
    fetchServices();
    fetchStats();
    api.get('/usuarios?user_type=B2B&limit=200')
      .then(res => setInstituciones(Array.isArray(res) ? res : []))
      .catch(e => console.error('Error fetching instituciones:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);"""
text = text.replace(use_effect_old, use_effect_new)

# 4. CSV Upload logic
csv_logic = """
  /* ── CSV Upload ──────────────────────────────────────── */
  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCsv(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const fileContent = evt.target.result;
        const lines = fileContent.split('\\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error('El archivo debe tener un encabezado y al menos una fila');
        
        let success = 0;
        let errors = 0;
        
        const isB2B = mode === 'instituto';
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cells.length < 3) continue;
          
          let sName = cells[1];
          // User said "misma estructura de la tabla de servicios". The table has ID as first column. So Name is cells[1]
          let sPrice = parseFloat((cells[isB2B ? 3 : 2] || '').replace(/[^0-9.-]+/g, "")) || 0;
          let sCost = parseFloat((cells[isB2B ? 4 : 3] || '').replace(/[^0-9.-]+/g, "")) || 0;
          let sInst = isB2B ? cells[2] : null;
          let sDesc = cells[isB2B ? 6 : 5] || null;
          
          if (!sName || sPrice <= 0) { errors++; continue; }
          
          const payload = {
            service_name: sName,
            service_value: sPrice,
            spent_per_service: sCost,
            description: sDesc,
            user_institute: mode,
          };
          if (isB2B && sInst) payload.nombre_instituto = sInst;
          
          try {
            await createServicio(payload);
            success++;
          } catch(err) { errors++; }
        }
        
        addToast(`Carga CSV lista: ${success} creados, ${errors} ignorados`, success > 0 ? 'success' : 'error');
        fetchServices(mode, searchTerm);
        fetchStats();
      } catch (err) {
        addToast(err.message, 'error', '✕');
      } finally {
        setUploadingCsv(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  /* ── Mode toggle ─────────────────────────────────────── */"""
text = text.replace("  /* ── Mode toggle ─────────────────────────────────────── */", csv_logic)

# 5. Datalist and action bar
action_bar_old = """      {/* ── Action bar ── */}
      <div className="sv-action-bar">
        <BlockedAction>
        <button
          className="sv-btn sv-btn--primary"
          onClick={startAddNew}
          disabled={isAddingNew || editingId !== null}
        >
          + Nuevo Servicio
        </button>
        </BlockedAction>
        <div className="sv-search-wrap">
          <span className="sv-search-icon">🔍</span>
          <input
            className="sv-search-input"
            type="text"
            placeholder="Buscar servicio..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>"""

action_bar_new = """      <datalist id="inst-list">
        {instituciones.map(i => <option key={i.user_id} value={i.user_name} />)}
      </datalist>

      {/* ── Action bar ── */}
      <div className="sv-action-bar">
        <BlockedAction>
        <button
          className="sv-btn sv-btn--primary"
          onClick={startAddNew}
          disabled={isAddingNew || editingId !== null}
        >
          + Nuevo Servicio
        </button>
        </BlockedAction>
        <BlockedAction>
        <button
          className="sv-btn sv-btn--primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingCsv || isAddingNew || editingId !== null}
          style={{ background: '#2E7D32', borderColor: '#2E7D32' }}
        >
          {uploadingCsv ? '⏳...' : '📄 Subir CSV'}
        </button>
        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCsvUpload} style={{ display: 'none' }} />
        </BlockedAction>
        <div className="sv-search-wrap">
          <span className="sv-search-icon">🔍</span>
          <input
            className="sv-search-input"
            type="text"
            placeholder="Buscar servicio..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        {mode === 'instituto' && (
          <div className="sv-search-wrap" style={{ flex: '0 1 230px' }}>
            <span className="sv-search-icon">🏢</span>
            <input
              className="sv-search-input"
              type="text"
              list="inst-list"
              placeholder="Filtrar Institución"
              value={institucionFiltro}
              onChange={(e) => setInstitucionFiltro(e.target.value)}
            />
          </div>
        )}
      </div>"""
text = text.replace(action_bar_old, action_bar_new)

# 6. Filtering rows
filter_old = """            {/* ── Data rows ── */}
            {!loading &&
              services.map((service) => {"""
filter_new = """            {/* ── Data rows ── */}
            {!loading &&
              services
                .filter(s => mode !== 'instituto' || !institucionFiltro || s.nombre_instituto?.toLowerCase().includes(institucionFiltro.toLowerCase()))
                .map((service) => {"""
text = text.replace(filter_old, filter_new)

# 7. Lists for Editing inline
inline_inst_new_old = """                    <input
                      className="sv-inline-input"
                      placeholder="Institución"
                      value={newServiceValues.nombre_instituto}"""
inline_inst_new_new = """                    <input
                      className="sv-inline-input"
                      placeholder="Institución"
                      list="inst-list"
                      value={newServiceValues.nombre_instituto}"""
text = text.replace(inline_inst_new_old, inline_inst_new_new)

inline_inst_edit_old = """                          <input
                            className="sv-inline-input"
                            value={editValues.nombre_instituto}"""
inline_inst_edit_new = """                          <input
                            className="sv-inline-input"
                            list="inst-list"
                            value={editValues.nombre_instituto}"""
text = text.replace(inline_inst_edit_old, inline_inst_edit_new)


with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("Modificaciones realizadas a Servicios.jsx")
