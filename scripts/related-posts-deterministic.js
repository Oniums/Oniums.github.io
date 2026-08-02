/* eslint-disable camelcase */
/**
 * Keep Butterfly related-post output deterministic between builds.
 *
 * Butterfly uses Math.random() as the final tie-breaker. That makes the
 * generated HTML change even when the source content is unchanged, which is
 * undesirable for a static site and its release checks.
 */

'use strict'

const { postDesc } = require('hexo-theme-butterfly/scripts/common/postDesc')

function timestamp (value) {
  if (!value) return 0
  if (typeof value.getTime === 'function') return value.getTime()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

hexo.once('ready', () => {
  hexo.extend.helper.register('related_posts', function (currentPost) {
  const relatedPosts = new Map()
  const tagsData = currentPost.tags

  if (!tagsData || !tagsData.length) return ''

  tagsData.forEach(tag => {
    const posts = tag.posts
    posts.forEach(post => {
      if (currentPost.path === post.path) return

      if (relatedPosts.has(post.path)) {
        relatedPosts.get(post.path).weight += 1
      } else {
        relatedPosts.set(post.path, {
          title: post.title,
          path: post.path,
          cover: post.cover,
          cover_type: post.cover_type,
          weight: 1,
          updated: post.updated,
          created: post.date,
          post
        })
      }
    })
  })

  if (relatedPosts.size === 0) return ''

  const hexoConfig = hexo.config
  const config = hexo.theme.config
  const limitNum = config.related_post.limit || 6
  const dateType = config.related_post.date_type || 'created'
  const headlineLang = this._p('post.recommend')

  const relatedPostsList = Array.from(relatedPosts.values()).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight

    const bDate = dateType === 'created' ? b.created : b.updated
    const aDate = dateType === 'created' ? a.created : a.updated
    if (timestamp(bDate) !== timestamp(aDate)) {
      return timestamp(bDate) - timestamp(aDate)
    }

    return a.path.localeCompare(b.path)
  })

  let result = '<div class="relatedPosts">'
  result += `<div class="headline"><i class="fas fa-thumbs-up fa-fw"></i><span>${headlineLang}</span></div>`
  result += '<div class="relatedPosts-list">'

  const max = Math.min(relatedPostsList.length, limitNum)
  for (let i = 0; i < max; i++) {
    const item = relatedPostsList[i]
    let { cover, title, path, cover_type, created, updated, post } = item
    const { escape_html, url_for, date } = this
    cover = cover || 'var(--default-bg-color)'
    title = escape_html(title)
    const desc = post.postDesc || postDesc(post, hexo)
    const className = desc ? 'pagination-related' : 'pagination-related no-desc'
    result += `<a class="${className}" href="${url_for(path)}" title="${title}">`
    if (cover_type === 'img') {
      result += `<img class="cover" src="${url_for(cover)}" alt="cover">`
    } else {
      result += `<div class="cover" style="background: ${cover}"></div>`
    }
    if (dateType === 'created') {
      result += `<div class="info text-center"><div class="info-1"><div class="info-item-1"><i class="far fa-calendar-alt fa-fw"></i> ${date(created, hexoConfig.date_format)}</div>`
    } else {
      result += `<div class="info text-center"><div class="info-1"><div class="info-item-1"><i class="fas fa-history fa-fw"></i> ${date(updated, hexoConfig.date_format)}</div>`
    }
    result += `<div class="info-item-2">${title}</div></div>`

    if (desc) {
      result += `<div class="info-2"><div class="info-item-1">${desc}</div></div>`
    }
    result += '</div></a>'
  }

  result += '</div></div>'
  return result
  })
})
