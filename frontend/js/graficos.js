// ================================================
//  graficos.js — Inicialização e atualização dos gráficos
// ================================================

const LABELS_TEMPO = Array.from({ length: 60 }, (_, i) => {
    if (i === 0)  return 'há 60s';
    if (i === 59) return 'agora';
    if (i % 10 === 0) return `${60 - i}s`;
    return '';
});

// ------------------------------------------------
// Inicializa os dois gráficos (chamado no boot)
// ------------------------------------------------
function inicializarGraficos() {
    const opcoesBase = (yMin, yMax, unidade) => ({
        responsive: true,
        animation:  false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: ctx => `${ctx.parsed.y.toFixed(1)} ${unidade}`
                }
            }
        },
        scales: {
            y: {
                min: yMin, max: yMax,
                grid:  { color: '#2a2a2a' },
                ticks: { color: '#777', callback: v => `${v} ${unidade}` }
            },
            x: {
                grid:  { color: '#2a2a2a' },
                ticks: { color: '#777', maxRotation: 0 }
            }
        }
    });

    chartPressao = new Chart(
        document.getElementById('pressaoChart').getContext('2d'),
        { type: 'line', data: { labels: LABELS_TEMPO, datasets: [] }, options: opcoesBase(15, 55, 'PSI') }
    );

    chartTemperatura = new Chart(
        document.getElementById('temperaturaChart').getContext('2d'),
        { type: 'line', data: { labels: LABELS_TEMPO, datasets: [] }, options: opcoesBase(10, 70, '°C') }
    );
}

// ------------------------------------------------
// Atualiza os dados do gráfico com o pneu selecionado
// ------------------------------------------------
function atualizarGraficos() {
    if (!chartPressao) return;

    const selId = parseInt(document.getElementById('selectorPneu').value);
    const p = pneus.find(x => x.id === selId) || pneus[0];
    if (!p) return;

    chartPressao.data.datasets = [
        {
            label: 'Pressão',
            data: p.historicoPressao,
            borderColor: '#FF8C00',
            backgroundColor: 'rgba(255,140,0,0.08)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            fill: true
        },
        {
            label: `Mínimo (${pressaoMin} PSI)`,
            data: Array(60).fill(pressaoMin),
            borderColor: '#4CAF50',
            borderWidth: 1,
            borderDash: [6, 3],
            pointRadius: 0,
            fill: false
        },
        {
            label: `Máximo (${pressaoMax} PSI)`,
            data: Array(60).fill(pressaoMax),
            borderColor: '#FF5252',
            borderWidth: 1,
            borderDash: [6, 3],
            pointRadius: 0,
            fill: false
        }
    ];
    chartPressao.update('none');

    chartTemperatura.data.datasets = [{
        label: 'Temperatura',
        data: p.historicoTemperatura,
        borderColor: '#FF6B6B',
        backgroundColor: 'rgba(255,107,107,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: true
    }];
    chartTemperatura.update('none');
}

// ------------------------------------------------
// Atualiza o <select> da aba Histórico
// ------------------------------------------------
function atualizarSelector() {
    const sel = document.getElementById('selectorPneu');
    const val = sel.value;
    sel.innerHTML = pneus.map(p =>
        `<option value="${p.id}">${p.nome}</option>`
    ).join('');
    if (val) sel.value = val;
}
