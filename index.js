// @ts-check
const fs = require('fs')
const path = require('path')
const {URL} = require('url')
const express = require('express')
const compression = require('compression')
const morgan = require('morgan')
const {pathToRegexp, compile: compileRedirectPath} = require('path-to-regexp')
const {createRequestHandler} = require('@remix-run/express')

if (process.env.FLY) {
  const Sentry = require('@sentry/node')
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.3,
    environment: process.env.NODE_ENV,
  })
  Sentry.setContext('region', process.env.FLY_REGION ?? 'unknown')
}

const MODE = process.env.NODE_ENV
const BUILD_DIR = path.join(process.cwd(), 'build')

const app = express()
app.disable('x-powered-by')

app.all('*', getRedirectsMiddleware())

app.use((req, res, next) => {
  if (req.path.endsWith('/') && req.path.length > 1) {
    const query = req.url.slice(req.path.length)
    const safepath = req.path.slice(0, -1).replace(/\/+/g, '/')
    res.redirect(301, safepath + query)
  } else {
    next()
  }
})

app.use(compression())

app.use(express.static('public', {maxAge: '1w'}))

// If we ever change our font (which we quite possibly never will)
// then we'll just want to change the filename or something...
app.use(express.static('public/fonts', {immutable: true, maxAge: '1y'}))

// Remix fingerprints its assets so we can cache forever
app.use(express.static('public/build', {immutable: true, maxAge: '1y'}))

app.use(morgan('tiny'))
app.all(
  '*',
  MODE === 'production'
    ? createRequestHandler({build: require('./build')})
    : (req, res, next) => {
        purgeRequireCache()
        const build = require('./build')
        return createRequestHandler({build, mode: MODE})(req, res, next)
      },
)

const port = process.env.PORT ?? 3000
app.listen(port, () => {
  // preload the build so we're ready for the first request
  // we want the server to start accepting requests asap, so we wait until now
  // to preload the build
  require('./build')
  console.log(`Express server listening on port ${port}`)
})

////////////////////////////////////////////////////////////////////////////////
function purgeRequireCache() {
  // purge require cache on requests for "server side HMR" this won't const
  // you have in-memory objects between requests in development,
  // alternatively you can set up nodemon/pm2-dev to restart the server on
  // file changes, we prefer the DX of this though, so we've included it
  // for you by default
  for (const key in require.cache) {
    if (key.startsWith(BUILD_DIR)) {
      delete require.cache[key]
    }
  }
}

function getRedirectsMiddleware() {
  const possibleMethods = ['HEAD', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', '*']
  const redirectsString = fs.readFileSync('./_redirects', 'utf8')
  const redirects = []
  const lines = redirectsString.split('\n')
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    let line = lines[lineNumber]
    line = line.trim()
    if (!line || line.startsWith('#')) continue

    let methods, from, to
    const [one, two, three] = line
      .split(' ')
      .map(l => l.trim())
      .filter(Boolean)
    const splitOne = one.split(',')
    if (possibleMethods.some(m => splitOne.includes(m))) {
      methods = splitOne
      from = two
      to = three
    } else {
      methods = ['*']
      from = one
      to = two
    }

    if (!from || !to) {
      console.error(`Invalid redirect on line ${lineNumber + 1}: "${line}"`)
      continue
    }
    const keys = []

    const toUrl = to.includes('//')
      ? new URL(to)
      : new URL(`https://same_host${to}`)
    try {
      redirects.push({
        methods,
        from: pathToRegexp(from, keys),
        keys,
        toPathname: compileRedirectPath(toUrl.pathname, {
          encode: encodeURIComponent,
        }),
        toUrl,
      })
    } catch (error) {
      // if parsing the redirect fails, we'll warn, but we won't crash
      console.error(`Failed to parse redirect on line ${lineNumber}: "${line}"`)
    }
  }

  return function redirectsMiddleware(req, res, next) {
    const host = req.header('X-Forwarded-Host') ?? req.header('host')
    const protocol = host.includes('localhost') ? 'http' : 'https'
    let reqUrl
    try {
      reqUrl = new URL(`${protocol}://${host}${req.url}`)
    } catch (error) {
      console.error(`Invalid URL: ${protocol}://${host}${req.url}`)
      next()
      return
    }
    for (const redirect of redirects) {
      try {
        if (
          !redirect.methods.includes('*') &&
          !redirect.methods.includes(req.method)
        ) {
          continue
        }
        const match = req.path.match(redirect.from)
        if (!match) continue

        const params = {}
        const paramValues = match.slice(1)
        for (
          let paramIndex = 0;
          paramIndex < paramValues.length;
          paramIndex++
        ) {
          const paramValue = paramValues[paramIndex]
          params[redirect.keys[paramIndex].name] = paramValue
        }
        const toUrl = redirect.toUrl

        toUrl.protocol = protocol
        if (toUrl.host === 'same_host') toUrl.host = reqUrl.host

        for (const [key, value] of reqUrl.searchParams.entries()) {
          toUrl.searchParams.append(key, value)
        }
        toUrl.pathname = redirect.toPathname(params)
        res.redirect(307, toUrl.toString())
        return
      } catch (error) {
        // an error in the redirect shouldn't stop the request from going through
        console.error(`Error processing redirects:`, {
          error,
          redirect,
          'req.url': req.url,
        })
      }
    }
    next()
  }
}
