import React, { Component } from 'react'
import ReactDOM from 'react-dom'
import { AppContainer } from 'react-hot-loader'
import { Map, List, fromJS } from 'immutable'

import muiThemeable from 'material-ui/styles/muiThemeable'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'

import {
  Card,
  CardActions,
  CardHeader,
  CardMedia,
  CardTitle,
  CardText
} from 'material-ui/Card'

import Toggle from 'material-ui/Toggle'

import Pass from 'material-ui/svg-icons/action/check-circle'
import Fail from 'material-ui/svg-icons/navigation/cancel'
import Timer from 'material-ui/svg-icons/image/timer'
import CircularProgress from 'material-ui/CircularProgress'

import Divider from 'material-ui/Divider'

import Flexbox from 'flexbox-react'

const events = [
  'start', //  Execution started
  'end', // Execution complete
  'suite', //Test suite execution started
  'suite end', //All tests (and sub-suites) have finished
  'test', // Test execution started
  'test end', // Test completed
  'hook', // Hook execution started
  'hook end', // Hook complete
  'pass', // Test passed
  'fail', // Test failed
  'pending' //Test pending
]

const reducer = (state, { type, args }) => {
  if (state === undefined) {
    state = Map({ path: List(), tests: List() })
  }
  switch (type) {
    case 'start':
      return state.set('status', 'started')
    case 'end':
      return state.set('status', 'ended')
    case 'suite':
      return state.update('path', (path) => path.push(args[0].title))
    case 'suite end':
      return state.update('path', (path) => path.pop())
    case 'test':
      return state.update('tests', (tests) => tests.push(
        Map({
          path: state.get('path'),
          title: args[0].title
        })
      ))
    case 'pass':
      return state.updateIn(
        ['tests', state.get('tests').size - 1],
        (test) => test.merge({
          state: 'pass',
          duration: args[0].ctx.test.duration
        })
      )
    case 'fail':
      return state.updateIn(
        ['tests', state.get('tests').size - 1],
        (test) => test.merge({
          state: 'fail',
          error: args[1],
          duration: args[0].ctx.test.duration
        })
      )
    case 'pending':
      return state.updateIn(
        ['tests', state.get('tests').size - 1],
        (test) => test.merge({
          state: 'pending'
        })
      )
    default:
      return state
  }
}

const stats = (tests) => tests.reduce((stats, test) => {
  switch (test.get('state')) {
    case 'pass':
      return stats.update('pass', 0, (n) => n + 1)
    case 'fail':
      return stats.update('fail', 0, (n) => n + 1)
    case 'pending':
      return stats.update('pending', 0, (n) => n + 1)
    default:
      return stats
  }
}, Map())

const escapeRe = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')

const Result = muiThemeable()(
  ({ test, muiTheme: { palette } }) => {
    const state = test.get('state')
    const error = test.get('error')

    const color = state === 'pass'
      ? palette.primary1Color
      : state === 'fail'
      ? palette.accent1Color
      : palette.primary3Color

    return (
      <CardText style={{ borderLeft: `3px solid ${color}` }}>
        <Flexbox justifyContent='space-between' alignItems='center'>
          <Flexbox alignItems='center'>
            {state === 'pass'
              ? <Pass color={color} />
              : state === 'fail'
              ? <Fail color={color} />
              : <CircularProgress size={20} color={color} />}
            <div style={{ margin: '0 5px' }}>{test.get('title')}</div>
          </Flexbox>
          <Flexbox alignItems='center'>
            <span style={{ margin: '0 5px' }}>{test.get('duration')} ms</span> <Timer />
          </Flexbox>
        </Flexbox>
        {state === 'fail'
          ? <div>
            <pre style={{ maxWidth: '100%', overflowX: 'scroll' }}>{error.stack}</pre>
          </div>
          : null}
      </CardText>
    )
  }
)

class Reporter extends Component {
  constructor(props) {
    super(props);
    this.state = {
      state: reducer(undefined, {}),
      filter: false
    }
  }
  handleRunnerEvent(type) {
    return (...args) => {
      this.setState(({ state }) => ({
        state: reducer(state, { type, args })
      }))
    }
  }
  componentDidMount() {
    const { runner } = this.props
    events.forEach((event) => {
      runner.on(event, this.handleRunnerEvent(event))
    })
  }
  render() {
    const { filter, state } = this.state
    const suites = state.get('tests')
      .filter((test) => {
        if (filter === false) {
          return true
        } else {
          return test.get('state') !== 'pass'
        }
      })
      .groupBy((test) => test.get('path'))

    return (
      <div>
        <pre>{JSON.stringify(stats(state.get('tests'), null, 2))}</pre>
        <Toggle
          label='Hide Passing'
          toggled={filter}
          onToggle={(_, filter) => this.setState({ filter })} />
        {suites.entrySeq().map(([path, suite], key) => {
          const fragments = path.filter((s) => s !== '')
          const href = `?grep=${encodeURIComponent(escapeRe(fragments.join(' ')))}`
          const file = fragments.get(0)
          const title = fragments.slice(1).join(' - ')
          return (
            <Card key={key} style={{ marginTop: key === 0 ? 0 : 34 }}>
              <CardTitle
                title={<a style={{textDecoration: 'none', color: 'inherit'}} href={href}>{title}</a>}
                subtitle={file}
              />
              {suite.map((test, i) =>
                <div key={i}>
                  <Divider />
                  <Result test={test} />
                </div>
              )}
            </Card>
          )
        })}
      </div>
    )
  }
}

mocha.reporter((runner) => {
  ReactDOM.render(
    <AppContainer>
      <MuiThemeProvider>
        <Reporter runner={runner} />
      </MuiThemeProvider>
    </AppContainer>,
    document.getElementById('mocha'))
})
