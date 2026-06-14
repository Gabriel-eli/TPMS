// ================================================
//  app.js — Inicialização e loop principal (tick)
// ================================================

document.addEventListener('DOMContentLoaded', () => {
    // Carrega a URL do input (em caso de mudança manual)
    document.getElementById('cfgUrl').value = urlESP32;
    
    adicionarPneusPadrao();
    inicializarGraficos();
    solicitarNotificacoes();
    renderizarAlertas();

    // Atualiza dados a cada 1 segundo
    setInterval(tick, 1000);
});

// ------------------------------------------------
// Tick: simula leitura do sensor e verifica alertas
// Futuramente: substituir por fetch() ao ESP32
// ------------------------------------------------
function tick() {
    if (!modoSimulado) {
        buscarDadosESP32();
        return;
    }

    pneus.forEach(p => {
        // Simula flutuação de pressão e temperatura
        p.pressao     += (Math.random() - 0.49) * 0.4;
        p.temperatura += (Math.random() - 0.5)  * 0.2;

        // Mantém dentro de limites físicos realistas
        p.pressao     = Math.max(18, Math.min(55, p.pressao));
        p.temperatura = Math.max(15, Math.min(60, p.temperatura));

        // Salva no histórico (janela deslizante de 60s)
        p.historicoPressao.shift();
        p.historicoPressao.push(parseFloat(p.pressao.toFixed(1)));
        p.historicoTemperatura.shift();
        p.historicoTemperatura.push(parseFloat(p.temperatura.toFixed(1)));

        // Avalia status
        p.statusAnterior = p.status;
        if      (p.pressao < pressaoMin) p.status = 'danger';
        else if (p.pressao > pressaoMax) p.status = 'warning';
        else                             p.status = 'ok';

        // Dispara alerta só na mudança de estado
        if (p.status !== p.statusAnterior && p.status !== 'ok') {
            const msg = p.status === 'danger'
                ? `${p.nome}: PRESSÃO BAIXA (${p.pressao.toFixed(1)} PSI)`
                : `${p.nome}: PRESSÃO ALTA (${p.pressao.toFixed(1)} PSI)`;

            registrarAlerta(p.nome, p.status, p.pressao);
            if (notifAtiva) emitirNotificacao('⚠️ Alerta de Pressão', msg);
            if (somAtivo)   emitirSom();
        }
    });

    renderizarPneus();
    atualizarGraficos();
}

// ------------------------------------------------
// Busca dados reais do ESP32
// ------------------------------------------------
async function buscarDadosESP32() {
    try {
        const response = await fetch(urlESP32 + '/api/sensores');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        const data = await response.json();
        atualizarComDadosReais(data);
    } catch (e) {
        console.error('❌ Erro ao buscar do ESP32:', e);
        // Opcionalmente: volta para modo simulado ou mostra erro na UI
    }
}

// ------------------------------------------------
// Atualiza pneus com dados reais do ESP32
// ------------------------------------------------
function atualizarComDadosReais(data) {
    // data esperado: [{ id, pressao, temperatura }, ...]
    data.forEach(d => {
        const p = pneus.find(x => x.id === d.id);
        if (!p) return;
        p.pressao     = d.pressao;
        p.temperatura = d.temperatura;

        // Salva no histórico
        p.historicoPressao.shift();
        p.historicoPressao.push(parseFloat(p.pressao.toFixed(1)));
        p.historicoTemperatura.shift();
        p.historicoTemperatura.push(parseFloat(p.temperatura.toFixed(1)));

        // Verifica alertas (igual ao simulado)
        p.statusAnterior = p.status;
        if      (p.pressao < pressaoMin) p.status = 'danger';
        else if (p.pressao > pressaoMax) p.status = 'warning';
        else                             p.status = 'ok';

        if (p.status !== p.statusAnterior && p.status !== 'ok') {
            const msg = p.status === 'danger'
                ? `${p.nome}: PRESSÃO BAIXA (${p.pressao.toFixed(1)} PSI)`
                : `${p.nome}: PRESSÃO ALTA (${p.pressao.toFixed(1)} PSI)`;

            registrarAlerta(p.nome, p.status, p.pressao);
            if (notifAtiva) emitirNotificacao('⚠️ Alerta de Pressão', msg);
            if (somAtivo)   emitirSom();
        }
    });

    renderizarPneus();
    atualizarGraficos();
}