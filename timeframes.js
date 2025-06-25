const TIMEFRAMES = {
    '1m': { label: 'دقيقة واحدة', interval: '1m', ms: 60000 },
    '5m': { label: '5 دقائق', interval: '5m', ms: 300000 },
    '15m': { label: '15 دقيقة', interval: '15m', ms: 900000 },
    '30m': { label: '30 دقيقة', interval: '30m', ms: 1800000 },
    '1h': { label: 'ساعة واحدة', interval: '1h', ms: 3600000 },
    '4h': { label: '4 ساعات', interval: '4h', ms: 14400000 },
    '1d': { label: 'يوم واحد', interval: '1d', ms: 86400000 },
    '1w': { label: 'أسبوع واحد', interval: '1w', ms: 604800000 }
};

// واجهة اختيار الإطار الزمني
function addTimeframeSelector() {
    const timeframeSelector = document.createElement('div');
    timeframeSelector.className = 'timeframe-selector';
    timeframeSelector.innerHTML = `
        <label>الإطار الزمني:</label>
        <select id="timeframeSelect">
            ${Object.entries(TIMEFRAMES).map(([key, tf]) => 
                `<option value="${key}" ${key === '1h' ? 'selected' : ''}>${tf.label}</option>`
            ).join('')}
        </select>
    `;
    
    document.querySelector('.controls-section').appendChild(timeframeSelector);
    
    document.getElementById('timeframeSelect').addEventListener('change', (e) => {
        window.cryptoBot.changeTimeframe(e.target.value);
    });
}
