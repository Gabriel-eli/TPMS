// ================================================
//  pneus.js — Criação, renderização e remoção de pneus
// ================================================

// ------------------------------------------------
// Cria um objeto pneu com histórico zerado
// ------------------------------------------------
function criarPneu(id, nome) {
    const pressaoInicial = 30 + Math.random() * 6;
    return {
        id,
        nome,
        pressao:             pressaoInicial,
        temperatura:         25 + Math.random() * 8,
        historicoPressao:    Array(60).fill(pressaoInicial),
        historicoTemperatura: Array(60).fill(25),
        status:              'ok',
        statusAnterior:      'ok'
    };
}

// ------------------------------------------------
// Adiciona os 4 pneus padrão ao iniciar
// ------------------------------------------------
function adicionarPneusPadrao() {
    const nomes = [
        'Dianteiro Esquerdo',
        'Dianteiro Direito',
        'Traseiro Esquerdo',
        'Traseiro Direito'
    ];
    nomes.forEach((nome, i) => pneus.push(criarPneu(i + 1, nome)));
    atualizarSelector();
    renderizarPneus();
}

// ------------------------------------------------
// Adiciona um pneu novo (botão "+")
// ------------------------------------------------
function adicionarPneu() {
    const id = pneus.length > 0 ? Math.max(...pneus.map(p => p.id)) + 1 : 1;
    pneus.push(criarPneu(id, `Pneu ${id}`));
    atualizarSelector();
    renderizarPneus();
}

// ------------------------------------------------
// Remove um pneu pelo id
// ------------------------------------------------
function removerPneu(id) {
    pneus = pneus.filter(p => p.id !== id);
    atualizarSelector();
    renderizarPneus();
}

// ------------------------------------------------
// Renderiza todos os cards de pneu na home
// ------------------------------------------------
function renderizarPneus() {
    const grid = document.getElementById('pneusGrid');
    grid.innerHTML = '';

    pneus.forEach(p => {
        const pct      = Math.min(100, Math.max(0, (p.pressao / PRESSAO_TOTAL) * 100));
        const okLeft   = (pressaoMin / PRESSAO_TOTAL) * 100;
        const okWidth  = ((pressaoMax - pressaoMin) / PRESSAO_TOTAL) * 100;

        const badgeTexto = p.status === 'ok'      ? '✔ Normal'
                         : p.status === 'warning'  ? '▲ Pressão Alta'
                         :                           '▼ Pressão Baixa';

        grid.innerHTML += `
        <div class="pneu-card ${p.status}">
            <div class="pneu-header">
                <div class="pneu-titulo">🛞 ${p.nome}</div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="pneu-badge ${p.status}">${badgeTexto}</span>
                    <button class="btn-remove" onclick="removerPneu(${p.id})">✕</button>
                </div>
            </div>

            <div class="pneu-stats">
                <div class="stat">
                    <div class="stat-label">Pressão</div>
                    <div class="stat-value">${p.pressao.toFixed(1)}</div>
                    <div class="stat-unit">PSI</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Temperatura</div>
                    <div class="stat-value">${p.temperatura.toFixed(1)}</div>
                    <div class="stat-unit">°C</div>
                </div>
            </div>

            <div class="pressao-barra-label">
                <span>Nível de pressão</span>
                <span>${p.pressao.toFixed(1)} / ${PRESSAO_TOTAL} PSI</span>
            </div>
            <div class="pressao-barra-track">
                <div class="pressao-barra-zona-ok" style="left:${okLeft}%;width:${okWidth}%"></div>
                <div class="pressao-barra-fill ${p.status}" style="width:${pct}%"></div>
            </div>
            <div class="pressao-barra-minmax">
                <span>0 PSI</span>
                <span style="color:var(--success)">Zona OK: ${pressaoMin}–${pressaoMax} PSI</span>
                <span>${PRESSAO_TOTAL} PSI</span>
            </div>
        </div>`;
    });

    document.getElementById('pneuCount').textContent = pneus.length;
    atualizarStatusGeral();
}

// ------------------------------------------------
// Atualiza o indicador de status no header
// ------------------------------------------------
function atualizarStatusGeral() {
    const dot  = document.getElementById('statusDot');
    const text = document.getElementById('statusText');

    if (pneus.some(p => p.status === 'danger')) {
        dot.className   = 'status-dot danger';
        text.textContent = '⚠ Crítico';
    } else if (pneus.some(p => p.status === 'warning')) {
        dot.className   = 'status-dot warning';
        text.textContent = '⚠ Atenção';
    } else {
        dot.className   = 'status-dot';
        text.textContent = 'Sistema Normal';
    }
}
