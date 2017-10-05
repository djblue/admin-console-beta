import React from 'react'

import { expect } from 'chai'

import { mount } from 'enzyme'

import LdapWizard from '.'

import { createStore, compose, applyMiddleware } from 'redux'
import { Provider } from 'react-redux'

import client from '../../client'
import { ApolloProvider } from 'react-apollo'

import reducer, { getWizard } from '../../reducer'

import DevTools from 'admin-redux-devtools'
const instrument = require('admin-redux-devtools/dev-tools').default.instrument

import MuiThemeProvider from 'admin-app-bar/MuiThemeProvider'

if (!window.__init) {
  window.__test = document.createElement('div')
  document.querySelector('body').prepend(window.__test)
  window.__init = true
}

const Shell = ({ store, client, children }) => (
  <div style={{ maxWidth: 800, margin: '100px auto' }}>
    <Provider store={store}>
      <ApolloProvider client={client}>
        <MuiThemeProvider>
          <div>
            {children}
            <DevTools />
          </div>
        </MuiThemeProvider>
      </ApolloProvider>
    </Provider>
  </div>
)

const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

const snapshot = (name) => ({ type: 'snapshot', name })
const restore = (name) => ({ type: 'restore', name })
const assert = (select, prop, ...args) => ({ type: 'assert', select, prop, args })
const waitFor = (select) => ({ type: 'wait', select })
const doTo = (select, at, prop, ...args) => ({ type: 'action', select, at, prop, args })
const click = (select) => doTo(select, 0, 'onClick')
const edit = (select, ...args) => doTo(select, 0, 'onEdit', ...args)
const editAt = (select, at, ...args) => doTo(select, at, 'onEdit', ...args)
const next = () => click('Next')

describe('<LdapWizard />', () => {
  const store = createStore((state, action) => {
    if (action.type === 'RESET') {
      return action.state
    }

    return reducer(state, action)
  }, undefined, compose(applyMiddleware(client.middleware()), instrument()))

  let wrapper = null
  const snapshots = {}
  const log = (...args) => null

  it('should mount <LdapWizard />', () => {
    wrapper = window.wrapper = mount(
      <Shell client={client} store={store}>
        <LdapWizard rootSelector={getWizard} />
      </Shell>,
      { attachTo: window.__test }
    )
  })

  const _it = (spec, actions) => it(spec, async () => {
    for (let i = 0; i < actions.length; i++) {
      const { type, select, at = 0, prop, args, name } = actions[i]
      // await sleep(100) // for debugging
      switch (type) {
        case 'snapshot':
          snapshots[name] = store.getState()
          log(type, name, store.getState())
          break
        case 'restore':
          store.dispatch({ type: 'RESET', state: snapshots[name] })
          log(type, name, snapshots[name])
          break
        case 'assert':
          expect(wrapper.find(select).first().prop(prop)).to.deep.equal(args[0])
          log(type, select, prop, args)
          break
        case 'wait':
          log(type, select)
          while (true) {
            const found = (typeof select === 'object')
              ? wrapper.findWhere((el) => {
                const props = el.props()
                return !Object.keys(select).some((key) => select[key] !== props[key])
              })
              : wrapper.find(select)
            if (found.length) {
              break
            }
            await sleep(100)
          }
          break
        case 'action':
          wrapper.find(select).at(at).prop(prop).apply(wrapper, args)
          log(type, select, at, prop, args)
          break
        default:
          throw new Error(`Unknown action type ${type}`)
      }
    }
  }).timeout(60000)

  const useCaseStage = (useCase) => [
    waitFor('#use-case-stage'),
    assert('Next', 'disabled', true),
    edit('RadioSelectionView', useCase),
    assert('Next', 'disabled', false)
  ]

  const typeSelectionStage = (type) => [
    waitFor('#ldap-type-selection'),
    assert('Next', 'disabled', true),
    edit('RadioSelectionView', type),
    assert('Next', 'disabled', false)
  ]

  const networkSettingsStage = (hostname, port, encryption) => [
    waitFor('#network-settings'),
    edit('Hostname', hostname),
    edit('Port', port),
    edit('SelectView', encryption)
  ]

  const bindSettingsStage = (bindUser) => [
    waitFor('#bind-settings'),
    edit('InputView', bindUser)
  ]

  const directorySettingsStage = (baseUserDn, userNameAttribute, baseGroupDn) => [
    waitFor('#directory-settings'),
    baseUserDn !== undefined
      ? editAt('InputAutoView', 0, baseUserDn) : undefined,
    userNameAttribute !== undefined
      ? editAt('InputAutoView', 1, userNameAttribute) : undefined,
    baseGroupDn !== undefined
      ? editAt('InputAutoView', 2, baseGroupDn) : undefined
  ].filter((value) => value !== undefined)

  describe('network settings stage unhappy paths', () => {
    _it('should start the wizard', [
      snapshot('clean'),
      click('Begin'),
      ...useCaseStage('Authentication'), next(),
      ...typeSelectionStage('openLdap'), next(),
      snapshot('network-settings')
    ])

    _it('should fail to bind because of unavailable hostname', [
      restore('network-settings'),
      ...networkSettingsStage('localhostt', 389, 'none'), next(),
      waitFor('Message'),
      assert('Message', 'message', 'Could not connect to the specified server.')
    ])

    _it('should fail to bind because of unavailable port', [
      restore('network-settings'),
      ...networkSettingsStage('localhost', 1234, 'none'), next(),
      waitFor('Message'),
      assert('Message', 'message', 'Could not connect to the specified server.')
    ])

    _it('should fail to bind because of unavailable encryption', [
      restore('network-settings'),
      ...networkSettingsStage('localhost', 389, 'startTls'), next(),
      waitFor('Message'),
      assert('Message', 'message', 'Could not connect to the specified server.')
    ])

    _it('should fail to bind because of unavailable encryption', [
      restore('network-settings'),
      ...networkSettingsStage('localhost', 389, 'ldaps'), next(),
      waitFor('Message'),
      assert('Message', 'message', 'Could not connect to the specified server.')
    ])

    _it('should clear the ldap wizard', [
      restore('clean')
    ])
  })

  describe('bind settings stage unhappy path', () => {
    _it('should start the wizard', [
      snapshot('clean'),
      click('Begin'),
      ...useCaseStage('Authentication'), next(),
      ...typeSelectionStage('openLdap'), next(),
      ...networkSettingsStage('localhost', 389, 'none'), next(),
      ...bindSettingsStage(''),
      snapshot('bind-settings')
    ])

    _it('should fail to bind with incorrect username', [
      restore('bind-settings'),
      ...bindSettingsStage('cn=admin'), next(),
      waitFor('Message'),
      assert('Message', 'message', 'Cannot authenticate user.')
    ])

    _it('should fail to bind without username', [
      restore('bind-settings'),
      ...bindSettingsStage(''), next(),
      waitFor({ errorText: 'Empty required field.' })
    ])

    _it('should clear the ldap wizard', [
      restore('clean')
    ])
  })

  describe('happy paths with openldap', () => {
    _it('should reach the confirmation stage', [
      snapshot('clean'),
      click('Begin'),
      ...useCaseStage('Authentication'), next(),
      ...typeSelectionStage('openLdap'), next(),
      ...networkSettingsStage('localhost', 389, 'none'), next(),
      ...bindSettingsStage('cn=Manager,dc=my-domain,dc=com'), next(),
      ...directorySettingsStage(
        'ou=People,dc=my-domain,dc=com',
        'uid',
        'ou=Group,dc=my-domain,dc=com'
      ), next(),
      waitFor('#confirm'),
      restore('clean')
    ])
  })
})
