// ================================================
//  alertas.js — Registro e exibição de alertas
// ================================================

// ------------------------------------------------
// Registra um novo alerta
// ------------------------------------------------
function registrarAlerta(nome, tipo, pressao) {
    alertas.unshift({
        id:     Date.now(),
        nome,
        tipo,
        pressao: pressao.toFixed(1),
        hora:    new Date().toLocaleTimeString('pt-BR')
    });

    if (alertas.length > 100) alertas.pop();

    renderizarAlertas();
    atualizarBadge();
}

// ------------------------------------------------
// Renderiza a lista de alertas na aba
// ------------------------------------------------
function renderizarAlertas() {
    const c = document.getElementById('alertasContainer');

    if (alertas.length === 0) {
        c.innerHTML = `
            <div class="empty-alertas">
                <div class="icon">✅</div>
                <h3>Nenhum alerta</h3>
                <p>Todos os pneus estão com pressão normal</p>
            </div>`;
        return;
    }

    c.innerHTML = alertas.map(a => `
        <div class="alerta-item ${a.tipo}">
            <div class="alerta-icon">${a.tipo === 'danger' ? '🔴' : '🟡'}</div>
            <div class="alerta-corpo">
                <div class="alerta-titulo">
                    ${a.tipo === 'danger' ? 'Pressão Baixa' : 'Pressão Alta'} — ${a.nome}
                </div>
                <div class="alerta-desc">
                    Pressão registrada: ${a.pressao} PSI
                    ${a.tipo === 'danger'
                        ? `(mínimo: ${pressaoMin} PSI)`
                        : `(máximo: ${pressaoMax} PSI)`}
                </div>
                <div class="alerta-hora">🕐 ${a.hora}</div>
            </div>
            <button class="btn-dismiss" onclick="removerAlerta(${a.id})">Dispensar</button>
        </div>
    `).join('');
}

// ------------------------------------------------
// Remove um alerta pelo id
// ------------------------------------------------
function removerAlerta(id) {
    alertas = alertas.filter(a => a.id !== id);
    renderizarAlertas();
    atualizarBadge();
}

// ------------------------------------------------
// Limpa todos os alertas
// ------------------------------------------------
function limparAlertas() {
    alertas = [];
    renderizarAlertas();
    atualizarBadge();
}

// ------------------------------------------------
// Atualiza o contador no botão da aba
// ------------------------------------------------
function atualizarBadge() {
    const badge = document.getElementById('alertaBadge');
    badge.textContent    = alertas.length > 0 ? ` (${alertas.length})` : '';
    badge.style.color    = 'var(--danger)';
    badge.style.fontWeight = 'bold';
}

// ------------------------------------------------
// Notificação do navegador
// ------------------------------------------------
function solicitarNotificacoes() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function emitirNotificacao(titulo, corpo) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(titulo, { body: corpo });
    }
}

// ------------------------------------------------
// Som de alerta (bipe via Web Audio API)
// ------------------------------------------------
function emitirSom() {
    try {
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
}
