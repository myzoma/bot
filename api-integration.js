class RealTimeDataProvider {
    constructor() {
        this.baseURL = 'https://api1.binance.com/api/v3';
        this.wsURL = 'wss://stream.binance.com:9443/ws';
        this.currentTimeframe = '1h'; // الإطار الزمني الافتراضي
    }

    // جلب الأسعار المباشرة
    async getRealTimePrices() {
        try {
            const response = await fetch(`${this.baseURL}/ticker/24hr`);
            const data = await response.json();
            
            return data.map(ticker => ({
                symbol: ticker.symbol,
                price: parseFloat(ticker.lastPrice),
                change24h: parseFloat(ticker.priceChangePercent),
                volume: parseFloat(ticker.volume),
                high24h: parseFloat(ticker.highPrice),
                low24h: parseFloat(ticker.lowPrice),
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('خطأ في جلب الأسعار:', error);
            return [];
        }
    }

    // جلب بيانات الشموع (Candlestick)
    async getCandlestickData(symbol, interval = '1h', limit = 100) {
        try {
            const response = await fetch(
                `${this.baseURL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
            );
            const data = await response.json();
            
            return data.map(candle => ({
                timestamp: candle[0],
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
        } catch (error) {
            console.error('خطأ في جلب بيانات الشموع:', error);
            return [];
        }
    }

    // WebSocket للبيانات المباشرة
    connectWebSocket(symbols) {
        const streams = symbols.map(symbol => 
            `${symbol.toLowerCase()}@ticker`
        ).join('/');
        
        const ws = new WebSocket(`${this.wsURL}/${streams}`);
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleRealTimeUpdate(data);
        };
        
        return ws;
    }

    handleRealTimeUpdate(data) {
        // تحديث البيانات في الوقت الفعلي
        const updateEvent = new CustomEvent('priceUpdate', {
            detail: {
                symbol: data.s,
                price: parseFloat(data.c),
                change: parseFloat(data.P),
                volume: parseFloat(data.v)
            }
        });
        
        document.dispatchEvent(updateEvent);
    }
}
