const RTMPInterceptor = require('..')

const params = {
  listenPort: '1936'
}

RTMPInterceptor.listen(params, async (client, tcUrl, SKey) => {
  console.log('tcUrl: '+tcUrl)      /* Do something with the data ... */
  console.log('StreamKey: '+SKey)

  return {                          /* Return false to block client and close stream */
    host: 'localhost',
    port: '1935',
    skChunks: ['\u0004\u0000\u0000\u0000\u0000\u0000)\u0014\u0001\u0000\u0000\u0000\u0002\u0000\u0007publish\u0000@\u0014\u0000\u0000\u0000\u0000\u0000\u0000\u0005\u0002\u0000\u000bMyHookedKey\u0002\u0000\u0004live']
  }
})
