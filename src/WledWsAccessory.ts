import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { WledWsHomebridgePlatform } from './WledWsPlatform';
import { WledController } from './WledController';
import { WLEDClient } from 'wled-client';
import { Logger } from 'homebridge';
import Timeout = NodeJS.Timeout;

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class WledWsPlatformAccessory {
  private service: Service;
  private wledClient;
  private connClosed = false;
  private wsPingIntervalMillis = 5000;
  private wsPingIntervalId: Timeout | null = null;
  private wsReconnectIntervalId: Timeout | null = null;
  private wsReconnectIntervalMillis = 10000;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Brightness: 100,
  };

  constructor(
    private readonly platform: WledWsHomebridgePlatform,
    private readonly log: Logger,
    private readonly accessory: PlatformAccessory,
  ) {

    this.log = log;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'smhex')
      .setCharacteristic(this.platform.Characteristic.Model, 'Wled')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '0000');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))       // SET - bind to the 'setBrightness` method below
      .onGet(this.getBrightness.bind(this));      // GET - bind to the `getBrightness` method below

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */


    this.connect();
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    this.exampleStates.On = value as boolean;

    // org debug
    this.platform.log.info('Set Characteristic On ->', value);
    if (value) {
      this.wledClient.turnOn();
    } else{
      this.wledClient.turnOff();
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const isOn = this.exampleStates.On;

    // org debg
    this.platform.log.info('Get Characteristic On ->', isOn);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return isOn;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  async setBrightness(value: CharacteristicValue) {
    // implement your own code to set the brightness
    this.exampleStates.Brightness = value as number;

    // org log debug
    this.platform.log.info('Set Characteristic Brightness -> ', value);
    this.wledClient.setBrightness(value);
  }

  /**
    */
  async getBrightness(): Promise<CharacteristicValue> {

    // implement your own code to check if the device is on
    const brightness = this.exampleStates.Brightness;

    // org debg
    this.platform.log.info('Get Characteristic Brightness ->', brightness);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return brightness;
  }

  /**
   *
   * Connect the controller
   */
  async connect(): Promise<boolean> {

    this.connClosed = false;

    const controller = <WledController>this.accessory.context.device;
    this.log.info('Connect to controller %s at address %s', controller.name, controller.address);
    this.wledClient = new WLEDClient(controller.address);

    this.wledClient.on('open', () => {
      this.log.info('Controller %s connected', controller.name);
    });

    this.wledClient.on('close', () => {
      this.log.info('Controller %s disconnected', controller.name);
    });

    // update accessory state
    this.wledClient.on('update:state', () => {
      this.updateState();

      //this.platform.log.debug(`Received state update for controller %s ${JSON.stringify(this.wledClient.state)}`, controller.name);
      this.log.info(`Received state update for controller %s ${JSON.stringify(this.wledClient.state)}`, controller.name);
    });

    /**
    wledClient.on('error', (error) => {
      this.log.error('Controller %s communication error: ' + error.message);
      this.clearWsPingInterval();
      if (!this.connClosed) {
        this.setWsReconnectInterval(listener);
      }
    });
    */
    try {
      await this.wledClient.init();
      this.log.info(`Controller %s version is ${this.wledClient.info.version}`, controller.name);
    } catch(e) {
      this.log.error('Caught rejected \'init\' promise.');

    }
    return true;
  }

  updateState(){
    this.exampleStates.On = this.wledClient.state.on;
    this.exampleStates.Brightness = this.wledClient.state.brightness;
    this.service.updateCharacteristic(this.platform.Characteristic.On, this.exampleStates.On);
    this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.exampleStates.Brightness);
  }

  disconnect(){
    if (!this.connClosed){
      const controller = <WledController>this.accessory.context.device;
      this.log.info('Disconnect controller %s', controller.name);
      this.wledClient.disconnect();
      this.connClosed = true;
    }

  }

}