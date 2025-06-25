class RealTimeCryptoBot extends EnhancedCryptoTradingBot {
    constructor() {
        super();
        this.dataProvider = new RealTimeDataProvider();
        this.currentTimeframe = '1h';
        this.websocket = null;
        this.updateInterval = null;
    }

    async start() {
        console.log('🚀 بدء البوت مع البيانات المباشرة...');
        
        // جلب البيانات الأولية
        await this.loadRealTimeData();
        
        // بدء WebSocket للتحديثات المباشرة
        this.startWebSocketConnection();
        
        // تحديث دوري للتحليل الفني
        this.startPeriodicAnalysis();
        
        super.start();
    }

    async loadRealTimeData() {
        try {
            const prices = await this.dataProvider.getRealTimePrices();
            
            // فلترة العملات المهمة فقط
            const importantCoins = [
                'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT',
                'SOLUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'MATICUSDT'
            ];
            
            this.cryptoData = prices.filter(coin => 
                importantCoins.includes(coin.symbol)
            );
            
            // جلب بيانات الشموع لكل عملة
            for (let coin of this.cryptoData) {
                const candleData = await this.dataProvider.getCandlestickData(
                    coin.symbol, 
                    TIMEFRAMES[this.currentTimeframe].interval
                );
                coin.candleData = candleData;
            }
            
            console.log(`📊 تم تحميل ${this.cryptoData.length} عملة رقمية`);
            
        } catch (error) {
            console.error('❌ خطأ في تحميل البيانات المباشرة:', error);
            // العودة للبيانات المحاكاة في حالة الخطأ
            this.loadMockData();
        }
    }

    startWebSocketConnection() {
        const symbols = this.cryptoData.map(coin => coin.symbol);
        this.websocket = this.dataProvider.connectWebSocket(symbols);
        
        // الاستماع لتحديثات الأسعار
        document.addEventListener('priceUpdate', (event) => {
            this.handlePriceUpdate(event.detail);
        });
        
        console.log('🔗 تم تفعيل الاتصال المباشر');
    }

    handlePriceUpdate(updateData) {
        // تحديث السعر في البيانات
        const coinIndex = this.cryptoData.findIndex(
            coin => coin.symbol === updateData.symbol
        );
        
        if (coinIndex !== -1) {
            this.cryptoData[coinIndex].price = updateData.price;
            this.cryptoData[coinIndex].change24h = updateData.change;
            this.cryptoData[coinIndex].lastUpdate = Date.now();
            
            // إعادة تحليل هذه العملة
            this.analyzeSpecificCoin(this.cryptoData[coinIndex]);
        }
    }

    startPeriodicAnalysis() {
        // تحليل شامل كل دقيقة للإطارات القصيرة
        // كل 5 دقائق للإطارات الطويلة
        const interval = this.currentTimeframe === '1m' || this.currentTimeframe === '5m' 
            ? 60000 : 300000;
            
        this.updateInterval = setInterval(() => {
            this.analyzeAllCoins();
        }, interval);
    }

    changeTimeframe(newTimeframe) {
        console.log(`⏰ تغيير الإطار الزمني إلى: ${TIMEFRAMES[newTimeframe].label}`);
        
        this.currentTimeframe = newTimeframe;
        
        // إعادة تحميل البيانات بالإطار الجديد
        this.loadRealTimeData();
        
        // إعادة ضبط التحديث الدوري
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.startPeriodicAnalysis();
    }

    stop() {
        if (this.websocket) {
            this.websocket.close();
        }
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        console.log('⏹️ تم إيقاف البوت والاتصالات المباشرة');
    }
}
