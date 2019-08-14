// @ts-nocheck
'use strict';

/*
 * Created with @iobroker/create-adapter v1.9.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const MTRF64Driver = require('mtrf64');
const SerialPort = require('serialport');
const Helper = require('./lib/helpers');
const InputDevices = require('./lib/InputDevices');


// Load your modules here, e.g.:
// const fs = require("fs");

class Noolitef extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'noolitef',
		});
		this.serialport = null;
		this.controller = null;
		this.parser = null;
		this.instances = [];
		this.on('ready', this.onReady);
		this.on('objectChange', this.onObjectChange);
		this.on('stateChange', this.onStateChange);
		this.on('message', this.onMessage);
		this.on('unload', this.onUnload);

	}
	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	onReady() {
		return new Promise((res) => {
			this.serialport = new SerialPort(this.config.devpath)
				// wait for the open event before claiming we are ready
				.on('open', () => res())
				// TODO: add other event handlers
			;
			// @ts-ignore
			if (!this.serialport.isOpen && !this.serialport.opening)
				this.serialport.open();
		}).then(() => {
			this.parser = this.serialport.pipe(new SerialPort.parsers.ByteLength({length: 17}));
			this.controller = new MTRF64Driver.Controller(this.serialport,this.parser);
			this._syncObject();
			this._mqttInit();
			this.subscribeStates('*');
			this.log.info('adapter ' + this.name + ' is ready');
		});

	}
	_syncObject() {
		this.log.info('start sync');
		const toDelete = [];
		const toAdd = [];
				
		if(this.config.devices) {
			this.getForeignObjects(this.namespace +'.*','channel',(err,objects) => {
				if(err) {
					this.log.error('No exits object in iobroker database');
				}
			    this.config.devices.forEach(element => {
					toAdd.push(element);
				});
				for(const c in objects) {				
					toDelete.push(objects[c]._id);
					for(const o of toAdd) {
						if(o  == objects[c]._id) {
				 			toDelete.pop();			
							break;
						}						
					}					
				}							
				setImmediate(this._syncDelete.bind(this),toDelete);
				setImmediate(this._syncAdd.bind(this),toAdd);
             		});
		}
	}
	_syncDelete(objects) {
		for(const c of objects) {
			this.deleteChannel(this.namespace + '.' + c);
		}
	}
	_syncAdd(objects) {
		let channel = undefined;
		let i = 0;
		for(const k in objects) {
			const c = objects[k];
			switch(parseInt(c.type)) {
				case 0:
					this.log.info('RemoteControl before');
					channel = new Helper.RemoteControl(this.namespace,c.name,c.channel,c.desc);
					this.log.info('RemoteControl');
					break;
				case 1:
					channel = new Helper.DoorSensor(this.namespace,c.name,c.channel,c.desc);
					this.log.info('DoorSensor');
					this.instances[i] = new InputDevices.DoorSensorDevice(this.controller,c.channel,0,
						this._handleInputEvent,c.name);
					this.controller.register(this.instances[i]);
					i++;
					break;
				case 2:
					channel = new Helper.WaterSensor(this.namespace,c.name,c.channel,c.desc);
					break;
				case 3:
					channel = new Helper.Dimmer(this.namespace,c.name,c.channel,c.desc);
					break;
				case 4:
					channel = new Helper.RGBRibbon(this.namespace,c.name,c.channel,c.desc);
					break;
				case 5:
					channel = new Helper.SimpleRelay(this.namespace,c.name,c.channel,c.desc);
					break;				
				case 6:
					channel = new Helper.MotionSensor(this.namespace,c.name,c.channel,c.desc);
					break;
				case 7:
					console.log.warn('Thermo sensor not supported in this version');
					continue;	
				default:
					continue;				
			}
			const r = channel.getObject();
			this.setForeignObject(r._id,r);
			for(const s of channel.getStates()) {
				this.setForeignObject(s._id,s);
			}
		}
	}
	_mqttInit() {

	}
	_handleInputEvent(name, data = null) {
		this.log.info('handle input events for' + this.namespace + '. ' + name + ' with data' + data);
		if(data != null)
			this.setState(this.namespace + '.' + name, {val: true, expire: 3, ack: true});	
		else 
			this.setState(this.namespace + '.' + name, {val: data, expire: 30, ack: true});	
	}
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	async onUnload(callback) {
		try {
			if (this.serialport && this.serialport.isOpen) {
				await this.serialport.close();
			}
			delete this.serialport;
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		this.log.info('object change from ' + id + 'with ' + JSON.stringify(obj));
		//TO DO
		// if (obj) {
		// 	// The object was changed
		// 	this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		// } else {
		// 	// The object was deleted
		// 	this.log.info(`object ${id} deleted`);
		// }
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {

		//TO DO
		this.log.info('state change from ' + id + 'with ' + JSON.stringify(state));
		// if (state) {
		// 	// The state was changed
		// 	this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		// } else {
		// 	// The state was deleted
		// 	this.log.info(`state ${id} deleted`);
		// }
	}

	/**
	 * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	 * Using this method requires "common.message" property to be set to true in io-package.json
	 * @param {ioBroker.Message} obj
	 */
	onMessage(obj) {
		this.log.info(JSON.stringify(obj));
		if (typeof obj === 'object' && obj.message) {
			if (obj.command === 'Bind') {
				this.log.info('Bind command');
				const result = Pairing(obj.message.type,obj.message.protocol,obj.message.channel);
				
				// Send response in callback if required
				if (obj.callback) this.sendTo(obj.from, obj.command, result, obj.callback);
			}
			else if (obj.command == 'Unbind') {
				this.log.info('Unbind command');
				if (obj.callback) this.sendTo(obj.from, obj.command, 'OK', obj.callback);

			}
		}
	}
	_internal() {
		console.log('stub');
	}

}

// @ts-ignore
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Noolitef(options);
} else {
	// otherwise start the instance directly
	new Noolitef();
}
