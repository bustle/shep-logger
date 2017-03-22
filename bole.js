'use strict'
const safeStringify = require('fast-safe-stringify')
const state = { fastTime: false }
const format = require('util').format

const levels = 'debug info warn error'.split(' ')
const functionName = (process.env.AWS_LAMBDA_FUNCTION_NAME || null)
const functionVersion = (process.env.AWS_LAMBDA_FUNCTION_VERSION || null)
let hasObjMode = false

// prepare a common part of the stringified output
const defaults = {}
levels.forEach(function (level) {
  defaults[level] = { level }
  if (functionName) {
    Object.assign(defaults[level], { functionName, functionVersion })
  }

  if (!Array.isArray(state[level])) {
    state[level] = []
  }
})

function stackToString (e) {
  let s = e.stack
  let causeError

  if (typeof e.cause === 'function' && (causeError = e.cause())) {
    s += '\nCaused by: ' + stackToString(causeError)
  }
  return s
}

function errorToOut (err, out) {
  out.err = {
    name: err.name,
    message: err.message,
    code: err.code, // perhaps
    stack: stackToString(err)
  }
}

function requestToOut (req, out) {
  out.req = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    remoteAddress: req.connection.remoteAddress,
    remotePort: req.connection.remotePort
  }
}

function objectMode (stream) {
  return stream._writableState && stream._writableState.objectMode === true
}

function makeLogObject (level, name, message, obj) {
  const line = Object.assign({
    time: state.fastTime ? Date.now() : new Date().toISOString(),
    name
  }, defaults[level])

  if (message !== undefined) {
    line.message = message
  }
  Object.assign(line, obj)
  return line
}

function stringify (level, name, message, obj) {
  return safeStringify(makeLogObject(level, name, message, obj))
}

function levelLogger (level, name) {
  var outputs = state[level]

  return function namedLevelLogger (input, a2) {
    if (outputs.length === 0) { return }

    let out = {}
    let objectOut
    let i = 0
    let l = outputs.length
    let stringified
    let message

    if (typeof input === 'string' || input == null) {
      if (!(message = format.apply(null, arguments))) {
        message = undefined
      }
    } else {
      if (!(message = format.apply(null, Array.prototype.slice.call(arguments, 1)))) {
        message = undefined
      }
      if (typeof input === 'boolean') {
        message = String(input)
      } else if (input instanceof Error) {
        errorToOut(input, out)
      } else if (typeof input === 'object') {
        if (input.method && input.url && input.headers && input.socket) {
          requestToOut(input, out)
        } else {
          Object.assign(out, input)
        }
      }
    }

    if (l === 1 && !hasObjMode) { // fast, standard case
      outputs[0].write(new Buffer(stringify(level, name, message, out) + '\n'))
      return
    }

    for (; i < l; i++) {
      if (objectMode(outputs[i])) {
        if (objectOut === undefined) { // lazy object creation
          objectOut = makeLogObject(level, name, message, out)
        }
        outputs[i].write(objectOut)
      } else {
        if (stringified === undefined) { // lazy stringify
          stringified = new Buffer(stringify(level, name, message, out) + '\n')
        }
        outputs[i].write(stringified)
      }
    }
  }
}

function bole (name) {
  function boleLogger (subname) {
    return bole(name + ':' + subname)
  }

  function makeLogger (p, level) {
    p[level] = levelLogger(level, name)
    return p
  }

  return levels.reduce(makeLogger, boleLogger)
}

bole.output = function output (opt) {
  let i = 0
  let b

  if (Array.isArray(opt)) {
    opt.forEach(bole.output)
    return bole
  }

  if (typeof opt.level !== 'string') {
    throw new TypeError('Must provide a "level" option')
  }

  for (; i < levels.length; i++) {
    if (!b && levels[i] === opt.level) {
      b = true
    }

    if (b) {
      if (opt.stream && objectMode(opt.stream)) {
        hasObjMode = true
      }
      state[levels[i]].push(opt.stream)
    }
  }

  return bole
}

bole.reset = function reset () {
  levels.forEach(function (level) {
    state[level].splice(0, state[level].length)
  })
  state.fastTime = false
  return bole
}

bole.setFastTime = function setFastTime (b) {
  if (!arguments.length) {
    state.fastTime = true
  } else {
    state.fastTime = b
  }
  return bole
}

module.exports = bole
