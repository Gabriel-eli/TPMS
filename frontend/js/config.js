// ================================================
//  config.js — Variáveis globais e configurações
// ================================================

// Estado dos pneus e alertas
let pneus   = [];
let alertas = [];

// Limites de pressão (PSI)
let pressaoMin = 26;
let pressaoMax = 41;

// Range máximo da barra visual
const PRESSAO_TOTAL = 70;

// Preferências de notificação
let notifAtiva    = true;
let somAtivo      = true;
let modoSimulado  = true;

// URL do ESP32 (carrega do localStorage)
let urlESP32 = localStorage.getItem('esp32_url') || 'http://192.168.1.100';

// Referências dos gráficos (inicializados em graficos.js)
let chartPressao     = null;
let chartTemperatura = null;

// ------------------------------------------------
// Sincroniza os limites com os inputs do Config
// ------------------------------------------------
function sincronizarConfig() {
    pressaoMin = parseFloat(document.getElementById('cfgMin').value);
    pressaoMax = parseFloat(document.getElementById('cfgMax').value);
}

// ------------------------------------------------
// Atualiza URL do ESP32 e salva no localStorage
// ------------------------------------------------
function atualizarUrlESP32() {
    urlESP32 = document.getElementById('cfgUrl').value;
    localStorage.setItem('esp32_url', urlESP32);
    console.log('✅ URL atualizada:', urlESP32);
}

// ------------------------------------------------
// Testa conexão com ESP32
// ------------------------------------------------
async function testarConexaoESP32() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Testando...';
    
    try {
        const response = await fetch(urlESP32 + '/api/sensores', { timeout: 5000 });
        if (response.ok) {
            alert('✅ Conexão bem-sucedida!');
            btn.textContent = '✅ Conectado';
            setTimeout(() => {
                btn.textContent = '🔌 Testar';
                btn.disabled = false;
            }, 2000);
        } else {
            alert('❌ Servidor respondeu com erro: ' + response.status);
            btn.textContent = '🔌 Testar';
            btn.disabled = false;
        }
    } catch (e) {
        alert('❌ Erro: ' + e.message + '\n\nVerifique se o ESP32 está ligado e o IP está correto.');
        btn.textContent = '🔌 Testar';
        btn.disabled = false;
    }
}

// ------------------------------------------------
// Alterna entre modo simulado e modo real (ESP32)
// ------------------------------------------------
function toggleModo() {
    modoSimulado = !modoSimulado;
    document.getElementById('toggleSimulado').classList.toggle('on');
    document.getElementById('modoTexto').textContent = modoSimulado
        ? '🟡 Modo simulado ativo — dados fictícios para demonstração'
        : `🟢 Modo real ativo — conectando a ${urlESP32}`;
}

// ------------------------------------------------
// Troca entre abas da navegação
// ------------------------------------------------
function switchTab(nome, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(nome).classList.add('active');
    btn.classList.add('active');
}