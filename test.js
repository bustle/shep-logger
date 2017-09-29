'use strict'
const test = require('tape')
const bl = require('bl')
const listStream = require('list-stream')
const bole = require('./')
const functionEnv = (process.env.ENV || null)
const functionName = (process.env.AWS_LAMBDA_FUNCTION_NAME || null)
const functionVersion = (process.env.AWS_LAMBDA_FUNCTION_VERSION || null)

function mklogobj (name, level, inp, fastTime) {
  var out = {
    time: fastTime ? Date.now() : new Date().toISOString(),
    name,
    level
  }
  if (functionName) {
    out.functionName = functionName
    out.functionVersion = functionVersion
    out.functionEnv = functionEnv
  }
  var k

  for (k in inp) {
    if (Object.prototype.hasOwnProperty.call(inp, k)) {
      out[k] = inp[k]
    }
  }

  return out
}

// take a log string and zero out the millisecond field
// to make comparison a little safer (not *entirely* safe)
function safe (str) {
  return str.replace(/("time":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.)\d{3}Z"/g, '$1xxxZ')
            .replace(/("remoteAddress":")(?:::ffff:)?(127.0.0.1")/g, '$1$2')
            .replace(/("host":")(?:(?:localhost)|(?:::))(:\d+")/g, '$1$2')
}

test('test simple logging', function (t) {
  t.plan(1)
  t.on('end', bole.reset)

  const sink = bl()
  const log = bole('simple')
  const expected = []

  bole.output({
    level: 'debug',
    stream: sink
  })

  expected.push(mklogobj('simple', 'debug', { aDebug: 'object' }))
  log.debug({ aDebug: 'object' })
  expected.push(mklogobj('simple', 'info', { anInfo: 'object' }))
  log.info({ anInfo: 'object' })
  expected.push(mklogobj('simple', 'warn', { aWarn: 'object' }))
  log.warn({ aWarn: 'object' })
  expected.push(mklogobj('simple', 'error', { anError: 'object' }))
  log.error({ anError: 'object' })

  sink.end(function () {
    var exp = expected.reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(sink.slice().toString()), safe(exp))
  })
})

test('test complex object logging', function (t) {
  t.plan(1)
  t.on('end', bole.reset)

  var sink = bl()
  const log = bole('simple')
  const expected = []
  const cplx = {
    aDebug: 'object',
    deep: { deeper: { deeperStill: { tooDeep: 'whoa' }, arr: [ 1, 2, 3, { eh: 'wut?' } ] } }
  }

  bole.output({
    level: 'debug',
    stream: sink
  })

  expected.push(mklogobj('simple', 'debug', cplx))
  log.debug(cplx)

  sink.end(function () {
    var exp = expected.reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(sink.slice().toString()), safe(exp))
  })
})

test('test multiple logs', function (t) {
  t.plan(1)
  t.on('end', bole.reset)

  const sink = bl()
  const log1 = bole('simple1')
  const log2 = bole('simple2')
  const expected = []

  bole.output({
    level: 'debug',
    stream: sink
  })

  expected.push(mklogobj('simple1', 'debug', { aDebug: 'object' }))
  log1.debug({ aDebug: 'object' })
  expected.push(mklogobj('simple1', 'info', { anInfo: 'object' }))
  log1.info({ anInfo: 'object' })
  expected.push(mklogobj('simple2', 'warn', { aWarn: 'object' }))
  log2.warn({ aWarn: 'object' })
  expected.push(mklogobj('simple2', 'error', { anError: 'object' }))
  log2.error({ anError: 'object' })

  sink.end(function () {
    var exp = expected.reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(sink.slice().toString()), safe(exp))
  })
})

test('test multiple outputs', function (t) {
  t.plan(4)
  t.on('end', bole.reset)

  const debugSink = bl()
  const infoSink = bl()
  const warnSink = bl()
  const errorSink = bl()
  const log = bole('simple')
  const expected = []

  // add individual
  bole.output({
    level: 'debug',
    stream: debugSink
  })

  // add array
  bole.output([
    {
      level: 'info',
      stream: infoSink
    },
    {
      level: 'warn',
      stream: warnSink
    }
  ])

  bole.output({
    level: 'error',
    stream: errorSink
  })

  expected.push(mklogobj('simple', 'debug', { aDebug: 'object' }))
  log.debug({ aDebug: 'object' })
  expected.push(mklogobj('simple', 'info', { anInfo: 'object' }))
  log.info({ anInfo: 'object' })
  expected.push(mklogobj('simple', 'warn', { aWarn: 'object' }))
  log.warn({ aWarn: 'object' })
  expected.push(mklogobj('simple', 'error', { anError: 'object' }))
  log.error({ anError: 'object' })

  debugSink.end()
  infoSink.end()
  warnSink.end()
  errorSink.end(function () {
    // debug
    var exp = expected.reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(debugSink.slice().toString()), safe(exp))

    // info
    exp = expected.slice(1).reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(infoSink.slice().toString()), safe(exp))

    // warn
    exp = expected.slice(2).reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(warnSink.slice().toString()), safe(exp))

    // error
    exp = expected.slice(3).reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(errorSink.slice().toString()), safe(exp))
  })
})

test('test string formatting', function (t) {
  t.plan(8)
  t.on('end', bole.reset)

  function testSingle (level, msg, args) {
    const sink = bl()
    const log = bole('strfmt')
    let expected

    bole.output({
      level: level,
      stream: sink
    })

    expected = mklogobj('strfmt', level, msg)
    log[level].apply(log, args)

    sink.end(function () {
      var exp = JSON.stringify(expected) + '\n'
      t.equal(safe(sink.slice().toString()), safe(exp))
    })

    bole.reset()
  }

  testSingle('debug', {}, [])
  testSingle('debug', { message: 'test' }, [ 'test' ])
  testSingle('info', { message: 'true' }, [ true ])
  testSingle('info', { message: 'false' }, [ false ])
  testSingle('warn', { message: 'a number [42]' }, [ 'a number [%d]', 42 ])
  testSingle('error', { message: 'a string [str]' }, [ 'a string [%s]', 'str' ])
  testSingle(
        'error'
      , { message: 'a string [str], a number [101], s, 1, 2 a b c' }
      , [ 'a string [%s], a number [%d], %s, %s, %s', 'str', 101, 's', 1, 2, 'a', 'b', 'c' ]
  )
  testSingle('error', { message: 'foo bar baz' }, [ 'foo', 'bar', 'baz' ])
})

test('test error formatting', function (t) {
  t.plan(1)
  t.on('end', bole.reset)

  const sink = bl()
  const log = bole('errfmt')
  const err = new Error('error msg in here')
  let expected

  bole.output({
    level: 'debug',
    stream: sink
  })

  expected = mklogobj('errfmt', 'debug', { err: {
    name: 'Error',
    message: 'error msg in here',
    stack: 'STACK'
  }})
  log.debug(err)

  sink.end(function () {
    const exp = JSON.stringify(expected) + '\n'
    let act = safe(sink.slice().toString())

    act = act.replace(/("stack":")Error:[^"]+/, '$1STACK')
    t.equal(act, safe(exp))
  })
})

test('test error formatting with message', function (t) {
  t.plan(1)
  t.on('end', bole.reset)

  const sink = bl()
  const log = bole('errfmt')
  const err = new Error('error msg in here')
  let expected

  bole.output({
    level: 'debug',
    stream: sink
  })

  expected = mklogobj('errfmt', 'debug', {
    message: 'this is a message',
    err: {
      name: 'Error',
      message: 'error msg in here',
      stack: 'STACK'
    }
  })
  log.debug(err, 'this is a %s', 'message')

  sink.end(function () {
    const exp = JSON.stringify(expected) + '\n'
    let act = safe(sink.slice().toString())

    act = act.replace(/("stack":")Error:[^"]+/, '$1STACK')
    t.equal(act, safe(exp))
  })
})

test('test sub logger', function (t) {
  t.plan(1)
  t.on('end', bole.reset)

  const sink = bl()
  const log = bole('parent')
  const expected = []
  let sub1
  let sub2

  bole.output({
    level: 'debug',
    stream: sink
  })

  expected.push(mklogobj('parent', 'debug', { aDebug: 'object' }))
  log.debug({ aDebug: 'object' })
  expected.push(mklogobj('parent', 'info', { anInfo: 'object' }))
  log.info({ anInfo: 'object' })
  expected.push(mklogobj('parent', 'warn', { aWarn: 'object' }))
  log.warn({ aWarn: 'object' })
  expected.push(mklogobj('parent', 'error', { anError: 'object' }))
  log.error({ anError: 'object' })

  expected.push(mklogobj('parent:sub1', 'debug', { aDebug: 'object' }))
  ;(sub1 = log('sub1')).debug({ aDebug: 'object' })
  expected.push(mklogobj('parent:sub1', 'info', { anInfo: 'object' }))
  sub1.info({ anInfo: 'object' })
  expected.push(mklogobj('parent:sub2', 'warn', { aWarn: 'object' }))
  ;(sub2 = log('sub2')).warn({ aWarn: 'object' })
  expected.push(mklogobj('parent:sub2:subsub', 'error', { anError: 'object' }))
  sub2('subsub').error({ anError: 'object' })

  sink.end(function () {
    var exp = expected.reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(sink.slice().toString()), safe(exp))
  })
})

test('test object logging', function (t) {
  t.on('end', bole.reset)

  const sink = listStream.obj()
  const log = bole('simple')
  const expected = []

  bole.output({
    level: 'debug',
    stream: sink
  })

  expected.push(mklogobj('simple', 'debug', { aDebug: 'object' }))
  log.debug({ aDebug: 'object' })
  expected.push(mklogobj('simple', 'info', { anInfo: 'object' }))
  log.info({ anInfo: 'object' })
  expected.push(mklogobj('simple', 'warn', { aWarn: 'object' }))
  log.warn({ aWarn: 'object' })
  expected.push(mklogobj('simple', 'error', { anError: 'object' }))
  log.error({ anError: 'object' })

  sink.end(function () {
    t.equal(sink.length, expected.length, 'correct number of log entries')
    for (var i = 0; i < expected.length; i++) {
      t.deepEqual(sink.get(i), expected[i], 'correct log entry #' + i)
    }
    t.end()
  })
})

test('test fast time', function (t) {
  t.plan(1)
  t.on('end', bole.reset)

  const sink = bl()
  const log = bole('simple')
  let expected = []

  bole.output({
    level: 'debug',
    stream: sink
  })

  bole.setFastTime(true)

  expected.push(mklogobj('simple', 'debug', { aDebug: 'object' }, true))
  log.debug({ aDebug: 'object' })
  expected.push(mklogobj('simple', 'info', { anInfo: 'object' }, true))
  log.info({ anInfo: 'object' })
  expected.push(mklogobj('simple', 'warn', { aWarn: 'object' }, true))
  log.warn({ aWarn: 'object' })
  expected.push(mklogobj('simple', 'error', { anError: 'object' }, true))
  log.error({ anError: 'object' })

  sink.end(function () {
    var exp = expected.reduce(function (p, c) {
      return p + JSON.stringify(c) + '\n'
    }, '')

    t.equal(safe(sink.slice().toString()), safe(exp))
  })
})
