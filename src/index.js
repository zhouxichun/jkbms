import JKBMS from './jkbms.js';

const jkbms = new JKBMS();
jkbms.on( JKBMS.EVENTS.DISCOVERD, ()=> { jkbms.connect(); }) 
.on( JKBMS.EVENTS.DEVICE_INFO, data => { console.log( data ); })
.on( JKBMS.EVENTS.EXTENT_INFO, data => {  console.log( data ); })
.on( JKBMS.EVENTS.CELLS_INFO, data => { console.log( data ); });

process.on('SIGINT', () => {
  console.log('exiting...');
  if( jkbms ){
    jkbms.disconnect();
  }
});
