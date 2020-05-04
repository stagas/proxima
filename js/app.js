import $ from './lib/element.js'
import morphdom from './lib/morphdom.js'
import randomId from './lib/random-id.js'
import State from './state.js'
import Net from './net.js'
import { formatter } from './parse.js'
import { generateKeyPair } from './crypto.js'

export default class App {
  constructor (el) {
    this.el = el
    this.app = this
  }

  async start () {
    this.net = new Net(this)
    this.keys = await generateKeyPair()
    this.state = new State(this, this.load())
    this.notice = formatter('notice')
    this.ui = $(UI, this)
    this.net.addEventListener('peer', () => this.render())
    this.net.addEventListener('data', () => this.render())
    document.addEventListener('render', () => this.render())
    this.net.connect()
    this.render()
  }

  dispatch (...message) {
    message = this.net.format(...message)
    console.log('dispatch', message)
    this.state.data.add(message)
    this.net.broadcast([message], this.net)
    // this.dispatchEvent(new CustomEvent('data', { detail: data }))
  }

  load () {
    return localStorage.data || ''
  }

  save () {
    localStorage.data = [...this.state.data].join('\r\n')
  }

  offerTo (cid) {
    this.net.offerTo(cid)
  }

  onrender (el) {
    if (el instanceof Element) {
      const expr = el.getAttribute('onrender')
      if (expr) {
        const fn = new Function(expr)
        fn.call(el)
      }
    }
  }

  render () {
    const html = this.ui.toString(true)
    morphdom(this.el, html, {
      onNodeAdded: this.onrender,
      onElUpdated: this.onrender,
      onAfterElUpdated: this.onrender
    })
  }
}

class UI {
  constructor () {
    this.isBottom = true
  }

  template () {
    const view = this.state.view
    const channel = view.channels.get('#garden')
    const peers = this.app.net.peers.map(peer => peer.cid)
    prevUser = null
    return `
      <div class="app">
        <div class="side">
          <div class="peers">
            ${ channel ? $.map([...channel.users].filter(cid => cid !== this.app.net.cid), cid =>
              `<div
                  class="peer ${ $.class({ direct: peers.includes(cid) }) }"
                  onclick="${ this.offerTo }('${cid}')">
                ${view.nicks.get(cid) || cid}
              </div>`) : '' }
          </div>
        </div>
        <div class="main" onscroll="${ this.checkScrollBottom }()" onrender="${ this.scrollToBottom }()">
          ${ $(ChatArea, { view, target: '#garden', app: this.app, state: this.state }) }
        </div>
      </div>
    `
  }

  checkScrollBottom () {
    this.isBottom = Math.round(this.scrollTop + this.clientHeight) >= this.scrollHeight - 50
    return false
  }

  scrollToBottom () {
    if (this.isBottom) this.scrollTop = this.scrollHeight
    return false
  }
}

class ChatArea {
  template () {
    const view = this.view
    const channel = this.view.channels.get(this.target)
    return `
      <div class="chatarea">
        <div class="wall">
          ${ channel ? $.map(channel.wall, post => $(Post, post, { view })) : ''}
        </div>
        <div class="chatbar">
          <div class="target">${this.app.net.cid}</div>
          <div class="nick">${ view.nicks.get(this.app.net.cid) }</div>
          <textarea
            class="${ $.class({ pre: this.state.textareaRows > 1 }) }"
            onkeydown="${ this.processKeyDown }(event)"
            oninput="${ this.processInput }()"
            rows=${ this.state.textareaRows }>${ this.state.newPost }</textarea>
          <button onclick="${ this.createPost }()">send</button>
          <div class="target">${this.target}</div>
        </div>
      </div>
    `
  }

  createPost () {
    if (!this.state.newPost.length) return
    this.app.dispatch('msg:#garden', this.state.newPost)
    this.state.newPost = ''
    this.state.textareaRows = 1
  }

  processKeyDown (event) {
    if (event.which === 13) {
      if (event.ctrlKey === true) {
        const pos = this.selectionStart
        this.value = this.value.slice(0, pos) + '\n' + this.value.slice(pos)
        this.processInput()
        this.selectionStart = this.selectionEnd = pos + 1
      } else {
        event.preventDefault()
        this.createPost()
        return false
      }
    } else {
      return false
    }
  }

  processInput (arg) {
    const rows = this.state.textareaRows
    this.state.newPost = this.value
    const computed = window.getComputedStyle(this.el)
    const newRows = Math.max(
      this.state.newPost.split('\n').length,
      Math.floor(this.scrollHeight / (parseFloat(computed.lineHeight)))
    )
    if (newRows === rows) return false
    this.state.textareaRows = newRows
  }
}

let prevUser, prevTime

class Post {
  // ({ meta, user, time, text, replies = [] }) => `
  template () {
    const lastPrevUser = prevUser
    const lastPrevTime = lastPrevUser !== this.cid ? 0 : prevTime
    prevUser = this.cid
    prevTime = parseInt(this.time)
    return `
      <br>
      <div class="post">
        ${ lastPrevUser !== this.cid ? `<a class="user" href="/#~${this.cid}">${htmlescape(this.view.nicks.get(this.cid))}:</a>` : `` }
        ${ prevTime - lastPrevTime > 1000 * 60 ? `
        <info>
          <!-- <time>${new Date(+this.time).toLocaleString()}</time> -->
          <a href="#">reply</a>
        </info>` : '' }
        <p class="${ this.text.includes('\n') ? 'pre' : '' }">${htmlescape(this.text, this.text.includes('\n'))}</p>
        ${ $.map(this.replies || [], post => $(Post, { view: this.view, ...post })) }
      </div>
    `
  }
}

function htmlescape (text, initialSpace) {
  text = text.replace(/&/g,'&amp;').replace(/</g,'&lt;')
  if (initialSpace) text = text.replace(/ /,'&nbsp;')
  return text
}

        // ${ this.privateOpen ? `
        //   <div class="private">
        //     ${ $(ChatArea, this.private[this.privatePeer.cid]) }
        //   </div>
        // ` : `` }

            // ${ $.map(this.app.net.peers.map(peer => [peer.cid, this.meta.getUser(peer.cid)]).concat(Object.keys(this.meta.nicks)
            //   .filter(pcid => !this.app.net.peers.map(peer => peer.cid).includes(pcid) && pcid !== cid)
            //   .map(pcid => [pcid, this.meta.getUser(pcid), true]))
            //   .sort((a, b) => a[1] > b[1] ? 1 : a[1] < b[1] ? -1 : 0)
            // , ([pcid, nick, inNetwork]) =>
            //   `<div class="peer ${inNetwork ? 'in-network' : ''}" ${inNetwork ? `data-cid="${pcid}" onclick="${ this.offerToPeer }(this.dataset.cid)"` : ''}>${htmlescape(nick)}</div>`) }