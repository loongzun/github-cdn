addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
  })
  
  /**
   * 处理请求，代理到GitHub raw内容
   * @param {Request} request 来自客户端的请求
   */
  async function handleRequest(request) {
    // 配置参数
    const config = {
      // 允许跨域请求的来源
      // 设置为 '*' 允许任何来源，或设置为您的网站域名
      corsOrigin: '*',
      
      // 缓存时间（秒）
      cacheTime: 86400, // 1天
      
      // GitHub原始内容的域名
      githubDomain: 'raw.githubusercontent.com',
      
      // KV命名空间名称 - 如果使用KV存储token
      kvNamespace: 'GITHUB_TOKENS'
    }
    
    // 获取URL路径
    const url = new URL(request.url)
    let path = url.pathname
    
    // 如果路径是根路径，返回简单的信息页面
    if (path === '/' || path === '') {
      return new Response(
        `<html>
          <head>
            <title>GitHub图床 CDN</title>
            <style>
              body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
              h1 { color: #0075ff; }
              code { background: #f1f1f1; padding: 2px 5px; border-radius: 3px; }
              .note { background: #fffde7; padding: 10px; border-left: 4px solid #ffd600; margin: 20px 0; }
            </style>
          </head>
          <body>
            <h1>GitHub图床 CDN</h1>
            <p>这是一个GitHub图床的CDN代理服务，支持公开和私有仓库。使用格式：</p>
            <code>${url.origin}/用户名/仓库名/分支名/文件路径</code>
            <p>例如：</p>
            <code>${url.origin}/username/images/main/folder/image.jpg</code>
            
            <div class="note">
              <h3>访问私有仓库</h3>
              <p>要访问私有仓库，您需要提供GitHub Token，有两种方式：</p>
              <ol>
                <li>通过查询参数: <code>${url.origin}/username/repo/main/image.jpg?token=YOUR_GITHUB_TOKEN</code></li>
                <li>通过请求头: 添加 <code>X-GitHub-Token: YOUR_GITHUB_TOKEN</code> 到请求头</li>
              </ol>
              <p>注意：请确保您的GitHub Token具有访问该仓库的权限。</p>
            </div>
            
            <p>将上述URL配置为您GitHub图床工具的自定义域名。</p>
          </body>
        </html>`,
        {
          headers: {
            'content-type': 'text/html;charset=UTF-8',
            'cache-control': `public, max-age=${config.cacheTime}`
          }
        }
      )
    }
    
    // 移除开头的斜杠
    if (path.startsWith('/')) {
      path = path.substring(1)
    }
    
    // 构建GitHub raw URL
    const githubUrl = `https://${config.githubDomain}/${path}`
    
    try {
      // 获取GitHub Token
      // 优先从请求头获取
      let token = request.headers.get('X-GitHub-Token')
      
      // 如果请求头中没有token，尝试从URL查询参数获取
      if (!token && url.searchParams.has('token')) {
        token = url.searchParams.get('token')
        
        // 从URL中移除token参数，避免将token传递给GitHub
        url.searchParams.delete('token')
      }
      
      // 如果仍然没有token，尝试从KV存储获取
      if (!token && typeof GITHUB_TOKENS !== 'undefined') {
        // 尝试获取默认token
        token = await GITHUB_TOKENS.get('default_token')
        
        // 或者根据仓库名获取特定token
        if (!token && path) {
          const repoPath = path.split('/').slice(0, 2).join('/')
          if (repoPath) {
            token = await GITHUB_TOKENS.get(repoPath)
          }
        }
      }
      
      // 如果仍然没有token，尝试从环境变量获取
      if (!token && typeof GITHUB_TOKEN !== 'undefined') {
        token = GITHUB_TOKEN
      }
      
      // 准备请求头
      const headers = new Headers()
      
      // 如果有token，添加到Authorization头
      if (token) {
        headers.set('Authorization', `token ${token}`)
      }
      
      // 获取图片内容
      const response = await fetch(githubUrl, {
        headers: headers
      })
      
      if (!response.ok) {
        // 对于401错误，提供更友好的提示
        if (response.status === 401) {
          return new Response(`访问被拒绝：GitHub Token无效或没有权限访问此资源`, { 
            status: 401,
            headers: {
              'content-type': 'text/plain;charset=UTF-8'
            }
          })
        }
        
        // 对于404错误，提供更友好的提示
        if (response.status === 404) {
          return new Response(`资源未找到：请检查仓库名称、分支名和文件路径是否正确`, { 
            status: 404,
            headers: {
              'content-type': 'text/plain;charset=UTF-8'
            }
          })
        }
        
        return new Response(`GitHub请求失败: ${response.status} ${response.statusText}`, { 
          status: response.status,
          statusText: response.statusText,
          headers: {
            'content-type': 'text/plain;charset=UTF-8'
          }
        })
      }
      
      // 获取原始响应体
      const originalBody = await response.arrayBuffer()
      
      // 获取原始响应头
      const responseHeaders = new Headers(response.headers)
      
      // 设置缓存控制
      responseHeaders.set('cache-control', `public, max-age=${config.cacheTime}`)
      
      // 设置CORS头
      responseHeaders.set('access-control-allow-origin', config.corsOrigin)
      responseHeaders.set('access-control-allow-methods', 'GET, HEAD, OPTIONS')
      responseHeaders.set('access-control-max-age', '86400')
      
      // 如果是预检请求，添加允许的头部
      if (request.method === 'OPTIONS') {
        responseHeaders.set('access-control-allow-headers', 'X-GitHub-Token, Content-Type')
      }
      
      // 设置安全头
      responseHeaders.set('x-content-type-options', 'nosniff')
      responseHeaders.set('x-frame-options', 'DENY')
      responseHeaders.set('x-xss-protection', '1; mode=block')
      responseHeaders.set('referrer-policy', 'strict-origin-when-cross-origin')
      
      // 返回修改过头部的响应
      return new Response(originalBody, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      })
    } catch (err) {
      // 处理错误
      return new Response(`代理请求出错: ${err.message}`, { 
        status: 500,
        headers: {
          'content-type': 'text/plain;charset=UTF-8'
        }
      })
    }
  }