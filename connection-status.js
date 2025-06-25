function addConnectionStatus() {
    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'connection-status';
    statusIndicator.innerHTML = `
        <div class="status-item">
            <span class="status-dot" id="dataStatus"></span>
            <span>البيانات: <span id="dataStatusText">غير متصل</span></span>
        </div>
        <div class="status-item">
            <span class="status-dot" id="wsStatus"></span>
            <span>التحديث المباشر: <span id="wsStatusText">غير متصل</span></span>
        </div>
        <div class="status-item">
            <span>آخر تحديث: <span id="lastUpdate">--</span></span>
        </div>
    `;
    
    document.querySelector('.header').appendChild(statusIndicator);
}
