const noble = require('@abandonware/noble');
const EventEmitter = require('events');

class JKBMS extends EventEmitter {
    constructor() {
        super();

        this.config = {
            SERVICE_UUID: 'ffe0',               // 极空 BMS 的 BLE 服务 UUID（通用值，部分型号可能不同）
            CHARACTERISTIC_UUID: 'ffe1',        // 极空 BMS 的特征值 UUID（用于读写数据）
            // 极空通信指令前缀（固定格式，具体指令参考极空协议文档）
            CMD_PREFIX: Buffer.from([0xaa,0x55,0x90,0xeb,0x97,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x11]), 
            CMD_CELL: Buffer.from([0xaa,0x55,0x90,0xeb,0x96,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x10]),
            DATA_PREFIX: '55aaeb90',
            ACK_PREFIX: 'aa5590eb',
        };

        this.peripheral = null;
        this.targetCharacteristic = null;
        this.isInited = false;
        this.initData = null;
        this.notifyData = null;
        this.deviceInfo = null;
        this.extentInfo = null;
        this.cellInfo = null;
        this.extentInfo = null;

        noble.on( 'stateChange', state => {
            if( state === 'poweredOn' ) {
                console.log( 'scaning JKBMS...' );
                noble.startScanning( [ this.config.SERVICE_UUID ], false );
            } 
            else {
                console.log( 'bluetooth device shutdown, turn on device first.' );
                noble.stopScanning();
            }
        });

        noble.on('discover', peripheral => { 
            if( !peripheral ) return;
            console.log(`discoverd：${ peripheral.address} | ${ peripheral.advertisement.localName}` );
            this.peripheral = peripheral;
            this.peripheral.on('disconnect', () => console.log('disconnected'));
            this.emit( 'discoverd：' );
            noble.stopScanning();
        });
    }

    connect( ) {
        if( !this.peripheral ) return;
        console.log(`connecting...` );

        this.peripheral.connect( err => {
            if( err ) return;

            console.log(`connected: ${ this.peripheral.address} | ${ this.peripheral.advertisement.localName}` );
            const serviceUUIDs = [ this.config.SERVICE_UUID ];
            const characteristicUUIDs = [ this.config.CHARACTERISTIC_UUID ];

            this.peripheral.discoverSomeServicesAndCharacteristics(
                serviceUUIDs,
                characteristicUUIDs,
                ( err, services, characteristics ) => {
                    if( err ) return;
                    if( !characteristics ) return;

                    console.log('services and characteristics found.');
                    this.targetCharacteristic = characteristics[0];
                    this.targetCharacteristic.subscribe( err => {
                        err ? console.error('Error subscribing') : console.log('Subscribed');
                    })
                    this.targetCharacteristic.on('data', (data, isNotification) => {
                        let hexStr = data.toString('hex');
                        hexStr = hexStr.replace('41540d0a', '');
                        if( hexStr.length === 0 ) return;

                        this.isInited ? this.handleNotifyData( hexStr ) : this.handleInitData( hexStr );
                    });

                    // 发送读取指令到保护板
                    setTimeout(() => {
                        this.sendCommand( this.config.CMD_PREFIX );
                    }, 1000);
                });
        });
    };

    sendCommand( cmdBuffer ) {
        if ( !this.targetCharacteristic ) return;
        this.targetCharacteristic.write(cmdBuffer, false, err => {
            err ? console.error('Failure sending：', err) : console.log('Send：', cmdBuffer.toString('hex'));    
        });
    }

    handleInitData( hexStr ){
        if( hexStr.startsWith( this.config.DATA_PREFIX ) ){
            this.initData = hexStr;
        }else if( hexStr.startsWith( this.config.ACK_PREFIX ) ){            //收到ACK消息，初始化完成
            console.log( 'inited ' )
            this.isInited = true;
            this.sendCommand( this.config.CMD_CELL );
        }else{
            this.initData += hexStr;
        };
    }

    handleNotifyData( hexStr ){
        if( hexStr.startsWith( this.config.DATA_PREFIX ) ){
            if( this.notifyData ) {
                this.parseNotifyData( this.notifyData );
                this.notifyData = '';
            } 
            this.notifyData = hexStr;
        }else{
            this.notifyData += hexStr;
        }
    }

    parseNotifyData( hexStr ){
       // console.info( 'notify: ', hexStr );
        const cmd = hexStr.slice(8,10);
        if( cmd === '01' ){
            this.parseExtentInfo( hexStr );
        }else if( cmd === '03' ){
            this.parseDeviceInfo( hexStr );
        }else if( cmd === '02'){
            this.parseCellInfo( hexStr );
        }else{
            console.log( hexStr );
        }
    }

    parseDeviceInfo ( hexStr ){
        // console.log( hexStr );
        const buffer = Buffer.from( hexStr, 'hex' );
        this.deviceInfo = {
            deviceName:  buffer.slice(6,22).toString('ascii').replace(/\x00/g, ''),
            hardwareVersion: buffer.slice(22,25).toString('ascii'),
            softwareVersion: buffer.slice(30,35).toString('ascii'),
            timesOfPowerup: buffer.readInt32LE(42),
            sn: buffer.slice(46,62).toString('ascii').replace(/\x00/g, ''),
            passcode: buffer.slice(62,78).toString('ascii').replace(/\x00/g, ''),
            firstTimePowerup: buffer.slice(78,84).toString('ascii'),
            vendor: buffer.slice(101,118).toString('ascii').replace(/\x00/g, ''),
            setupcode: buffer.slice(118,128).toString('ascii').replace(/\x00/g, ''),
        };

        //console.log( this.deviceInfo );
        this.emit( 'device-info', this.deviceInfo );
    }

    parseExtentInfo( hexStr ){
       // console.log( hexStr );
        const buffer = Buffer.from( hexStr, 'hex' );

        this.extentInfo = {
            v_sleep: buffer.readInt32LE(6),                     //智能体休眠电压, 0.001V, 3500          
            v_low_protect: buffer.readInt32LE(10),              //单体欠压保护, 0.001V, 2580
            v_low_restore: buffer.readInt32LE(14),              //单体欠压恢复, 0.001V, 2620
            v_over_protect: buffer.readInt32LE(18),             //单体过充保护, 0.001V, 3650
            v_over_restore: buffer.readInt32LE(22),             //单体过充恢复, 0.001V, 3580
            v_gap_balance_start: buffer.readInt32LE(26),        //均衡触发压差, 0.001V, 10 
            v_soc_top: buffer.readInt32LE(30),                  //soc 100%电压, 0.001V, 3590
            v_soc_bottom: buffer.readInt32LE(34),               //soc 0%电压, 0.001V, 2600
            v_charge: buffer.readInt32LE(38),                   //推荐充电电压, 0.001V, 3600
            v_pre_charge: buffer.readInt32LE(42),               //推荐浮充电压, 0.001V, 3500
            v_shutdown_auto: buffer.readInt32LE(46),            //自动关机电压, 0.001V, 2500
            c_charge: buffer.readInt32LE(50),                   //持续充电电流, 0.001A, 10000
            c_charge_over_delay: buffer.readInt32LE(54),        //充电过流验收, s, 60
            c_charge_over_restorey: buffer.readInt32LE(58),     //充电过流恢复, s, 60
            c_discharge: buffer.readInt32LE(62),                //持续放电电流, 0.001A, 100000
            c_discharge_over_delay: buffer.readInt32LE(66),     //放电过流延时, s, 300
            c_discharge_over_restore: buffer.readInt32LE(70),   //放电过流恢复, s, 60
            short_circuit_restore:    buffer.readInt32LE(74),   //短路保护解除，s, 5
            c_balance_max: buffer.readInt32LE(78),              //最大均衡电流  0.001A,1000
            t_discharge_over_protect: buffer.readInt32LE(82),   //放电过温保护, 0.1℃, 700
            t_discharge_over_restore: buffer.readInt32LE(86),   //放电过温恢复, 0.1℃, 600
            t_charge_over_protect: buffer.readInt32LE(90),      //充电过温保护, 0.1℃, 700
            t_charge_over_restore:    buffer.readInt32LE(94),   //充电过温恢复, 0.1℃, 600
            t_charge_low_protect: buffer.readInt32LE(98),       //充电低温保护, 0.1℃, 10
            t_charge_low_restore: buffer.readInt32LE(102),      //充电低温恢复, 0.1℃, 50
            t_mos_over_protect: buffer.readInt32LE(106),        //MOS过温保护, 0.1℃, 800
            t_mos_over_restore: buffer.readInt32LE(110),        //MOS过温恢复, 0.1℃, 700
            count_batteries: buffer.readInt32LE(114),           //电芯数量, 1个
            capacity: buffer.readInt32LE(130),                  //电芯额定容量, 0.001AH
            short_circuit_protect_delay: buffer.readInt32LE(134),    //短路保护延时 微秒, 1500
            v_balance_start: buffer.readInt32LE(138),                //均衡启动电压, 0.001V, 3000
        }

        //console.log( this.extentInfo );

        this.emit('extent-info', this.extentInfo);
    }

    parseCellInfo( hexStr ){
        //console.log( hexStr );
        if( !this.extentInfo ) return;
        const buffer = Buffer.from( hexStr, 'hex' );

        this.cellInfo = {
            voltage: 0,
            v_cells: [],
            actual_capacity: this.extentInfo.capacity
        };

        let offset = 6;
        for( var i = 0; i < this.extentInfo.count_batteries; i++ ){
            const v =  buffer.readInt16LE( offset );
            this.cellInfo.voltage += v;
            this.cellInfo.v_cells.push( v );
            let voc = Math.max( (v - this.extentInfo.v_soc_bottom), 0 );
            this.cellInfo.actual_capacity = Math.min( this.cellInfo.actual_capacity, 
                Math.floor( this.extentInfo.capacity * voc / Math.abs( (this.extentInfo.v_soc_top - this.extentInfo.v_soc_bottom )))
            );
            offset += 2;
        }
        
        this.cellInfo.soc = Math.floor( ( 100 * this.cellInfo.actual_capacity / this.extentInfo.capacity ));
        this.cellInfo.current  =  buffer.readInt16LE( 158 );
        this.cellInfo.c_derection  =  buffer.readInt16LE( 160 );
        this.cellInfo.t_device  = buffer.readInt16LE( 144 );
        this.cellInfo.t_sensor1  =  buffer.readInt16LE( 162 );
        this.cellInfo.t_sensor2  = buffer.readInt16LE( 164 );
        //console.log( this.cellInfo );

        this.emit('cells-info', this.cellInfo);
    }

    disconnect(){
        if( this.peripheral ){
            this.peripheral.disconnect();
        }
    }
}

module.exports = JKBMS;
