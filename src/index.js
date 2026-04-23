const JKBMS = require('./jkbms');

const jkbms = new JKBMS();
jkbms.on( 'discoverd：', ()=> {
  jkbms.connect();})
.on( 'device-info', data => {
  console.log( data );
})
.on( 'extent-info', data => {
  console.log( data );
})
.on( 'cells-info', data => {
  console.log( data );
});

process.on('SIGINT', () => {
  console.log('exiting...')
  if( jkbms ){
    jkbms.disconnect();
  }
});
