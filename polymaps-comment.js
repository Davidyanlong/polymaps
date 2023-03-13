// 全局判断是否存在变量org, 不存在就创建一个
if (!org) var org = {};
// 判断该命名空间下是否定义了polymaps,不存在就创建一个
if (!org.polymaps) org.polymaps = {};
// 创建一个自执行函数，传入 po = org.polymaps
(function (po) {
  // 定义个版本号
  po.version = "2.5.1"; // semver.org
  // 定义一个 0 向量
  var zero = { x: 0, y: 0 };

  po.ns = {
    svg: "http://www.w3.org/2000/svg",
    xlink: "http://www.w3.org/1999/xlink",
  };
  // 计算元素空间和对象
  function ns(name) {
    var i = name.indexOf(":");
    return i < 0
      ? name
      : {
          space: po.ns[name.substring(0, i)],
          local: name.substring(i + 1),
        };
  }
  // 通过一个闭包，每次调用id函数都获取一个新的id
  po.id = (function () {
    var id = 0;
    return function () {
      return ++id;
    };
  })();
  // 创建一个SVG DOM 对象
  po.svg = function (type) {
    return document.createElementNS(po.ns.svg, type);
  };

  /**
   * SVG 矩阵
   * | a c e |
   * | b d f |
   * | 0 0 0 |
   * @param {*} a
   * @param {*} b
   * @param {*} c
   * @param {*} d
   * @param {*} e
   * @param {*} f
   * @returns
   */
  po.transform = function (a, b, c, d, e, f) {
    var transform = {},
      zoomDelta,
      // 细微缩放
      zoomFraction,
      k;

    // 如果没有传值，默认值理解为单元矩阵
    if (!arguments.length) {
      a = 1;
      c = 0;
      e = 0;
      b = 0;
      d = 1;
      f = 0;
    }
    // ?
    transform.zoomFraction = function (x) {
      // 如果没有参数，就相对于get方法，获取 zoomFraction
      if (!arguments.length) return zoomFraction;
      zoomFraction = x;
      zoomDelta = Math.floor(zoomFraction + Math.log(Math.sqrt(a * a + b * b + c * c + d * d)) / Math.LN2);
      k = Math.pow(2, -zoomDelta);
      return transform;
    };

    // ?
    transform.apply = function (x) {
      var k0 = Math.pow(2, -x.zoom),
        k1 = Math.pow(2, x.zoom - zoomDelta);
      return {
        column: (a * x.column * k0 + c * x.row * k0 + e) * k1,
        row: (b * x.column * k0 + d * x.row * k0 + f) * k1,
        zoom: x.zoom - zoomDelta,
      };
    };
    // ?
    transform.unapply = function (x) {
      var k0 = Math.pow(2, -x.zoom),
        k1 = Math.pow(2, x.zoom + zoomDelta);
      return {
        column: ((x.column * k0 * d - x.row * k0 * c - e * d + f * c) / (a * d - b * c)) * k1,
        row: ((x.column * k0 * b - x.row * k0 * a - e * b + f * a) / (c * b - d * a)) * k1,
        zoom: x.zoom + zoomDelta,
      };
    };

    // 序列号输出
    transform.toString = function () {
      return "matrix(" + [a * k, b * k, c * k, d * k].join(" ") + " 0 0)";
    };

    // 范围微调系数为 0 的 transform对象
    return transform.zoomFraction(0);
  };
  po.cache = function (load, unload) {
    var cache = {},
      locks = {},
      map = {},
      head = null,
      tail = null,
      size = 64,
      n = 0;

    function remove(tile) {
      n--;
      if (unload) unload(tile);
      delete map[tile.key];
      // 链表数据删除节点
      if (tile.next) tile.next.prev = tile.prev;
      else if ((tail = tile.prev)) tail.next = null;
      if (tile.prev) tile.prev.next = tile.next;
      else if ((head = tile.next)) head.prev = null;
    }

    function flush() {
      // 每删除一个tile n-1, 从尾部往头部删除
      for (var tile = tail; n > size; tile = tile.prev) {
        if (!tile) break;
        if (tile.lock) continue;
        remove(tile);
      }
    }
    // 读取数据，根据map key =  zoom/column/row
    cache.peek = function (c) {
      return map[[c.zoom, c.column, c.row].join("/")];
    };
    /**
     *
     * @param {column:number,row:number,zoom:number} c 瓦片编号
     * @param { function } projection 投影函数
     * @returns
     */
    cache.load = function (c, projection) {
      // 加载的key
      var key = [c.zoom, c.column, c.row].join("/"),
        // 从map 中获取
        tile = map[key];
      // 如果存在
      if (tile) {
        // 判断上一个tile
        if (tile.prev) {
          // 讲自己的上级执行自己的下级
          tile.prev.next = tile.next;
          // 告诉自己的下级，他的上级是自己的上级
          if (tile.next) tile.next.prev = tile.prev;
          // 如果自己没有下级，告诉自己的上级，就是末尾
          else tail = tile.prev;
          // 自己的上级指向 空
          tile.prev = null;
          // 自己的下级指向 头
          tile.next = head;
          // 头的上级指向 自己
          head.prev = tile;
          // 头就是自己， 说明头的下级指向自己，上级为null
          head = tile;
        }
        // 将自己锁定，防止删除
        tile.lock = 1;
        // 放到锁定的列表中
        locks[key] = tile;
        return tile;
      }
      // 如果map 中不存在，定义一个数据对象， next指向头，prev为null ,并锁定
      tile = {
        key: key,
        column: c.column,
        row: c.row,
        zoom: c.zoom,
        next: head,
        prev: null,
        lock: 1,
      };
      // 调用传入的 load 方法，及投影
      load.call(null, tile, projection);
      // 锁定记录，并保持在map中
      locks[key] = map[key] = tile;
      // 如果头存在，头的上级指向他
      if (head) head.prev = tile;
      // 否则，他就是末尾
      else tail = tile;
      // 头就是刚创建的tile
      head = tile;
      // n+1
      n++;
      return tile;
    };

    cache.unload = function (key) {
      // 如果这个key 不在锁定列表中，不需要执行
      if (!(key in locks)) return false;
      // 从锁定列表中获取
      var tile = locks[key];
      // 设置为不锁定
      tile.lock = 0;
      // 从锁定列表中删除
      delete locks[key];
      // 忽略请求，并移除给瓦片
      if (tile.request && tile.request.abort(false)) remove(tile);
      return tile;
    };

    // 返回所有的锁定列表
    cache.locks = function () {
      return locks;
    };

    // 返回或设置 缓存的大小
    cache.size = function (x) {
      // 参数为空，返回size 值
      if (!arguments.length) return size;
      size = x;
      // 清理缓存的数据
      flush();
      return cache;
    };

    // 清理缓存的数据
    cache.flush = function () {
      flush();
      return cache;
    };

    // 清空瓦片
    cache.clear = function () {
      for (var key in map) {
        var tile = map[key];
        // 中断瓦片的请求
        if (tile.request) tile.request.abort(false);
        // 如果定义unload函数，调用unload
        if (unload) unload(map[key]);
        if (tile.lock) {
          tile.lock = 0;
          tile.element.parentNode.removeChild(tile.element);
        }
      }
      locks = {};
      map = {};
      head = tail = null;
      n = 0;
      return cache;
    };

    return cache;
  };
  po.url = function (template) {
    var hosts = [],
      repeat = true;
    // ?
    function format(c) {
      // zoom 的值，如果是小于0 就取1，否则就是2平方
      var max = c.zoom < 0 ? 1 : 1 << c.zoom,
        column = c.column;
      if (repeat) {
        column = c.column % max;
        // 如果column 是负数，计算max,取对应的正数
        if (column < 0) column += max;
      } else if (column < 0 || column >= max) {
        return null;
      }
      // 替换url 字符串中{}的值
      return template.replace(/{(.)}/g, function (s, v) {
        switch (v) {
          // 如果是S 就返回 hosts结果的值
          case "S":
            return hosts[(Math.abs(c.zoom) + c.row + column) % hosts.length];
          // 如果是Z 就返回zoom
          case "Z":
            return c.zoom;
          // 如果是X 就返回 column
          case "X":
            return column;
          // 如果是Y 就返回 row
          case "Y":
            return c.row;
          // 如果是B 就返回 东南的经纬度，西北方向的经纬度
          case "B": {
            var nw = po.map.coordinateLocation({
                row: c.row,
                column: column,
                zoom: c.zoom,
              }),
              se = po.map.coordinateLocation({
                row: c.row + 1,
                column: column + 1,
                zoom: c.zoom,
              }),
              pn = Math.ceil(Math.log(c.zoom) / Math.LN2);
            return se.lat.toFixed(pn) + "," + nw.lon.toFixed(pn) + "," + nw.lat.toFixed(pn) + "," + se.lon.toFixed(pn);
          }
        }
        return v;
      });
    }
    // 设置或者返回 需要替换的url 模板
    format.template = function (x) {
      if (!arguments.length) return template;
      template = x;
      return format;
    };

    format.hosts = function (x) {
      if (!arguments.length) return hosts;
      hosts = x;
      return format;
    };

    format.repeat = function (x) {
      if (!arguments.length) return repeat;
      repeat = x;
      return format;
    };

    return format;
  };
  // 为对象增加 on off 事件，派发事件
  po.dispatch = function (that) {
    var types = {};

    // 绑定事件
    that.on = function (type, handler) {
      var listeners = types[type] || (types[type] = []);
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i].handler == handler) return that; // already registered
      }
      listeners.push({ handler: handler, on: true });
      return that;
    };

    // 减除事件
    that.off = function (type, handler) {
      var listeners = types[type];
      if (listeners)
        for (var i = 0; i < listeners.length; i++) {
          var l = listeners[i];
          if (l.handler == handler) {
            l.on = false;
            listeners.splice(i, 1);
            break;
          }
        }
      return that;
    };

    // 派发事件
    return function (event) {
      var listeners = types[event.type];
      if (!listeners) return;
      listeners = listeners.slice(); // defensive copy
      for (var i = 0; i < listeners.length; i++) {
        var l = listeners[i];
        if (l.on) l.handler.call(that, event);
      }
    };
  };
  po.queue = (function () {
    var queued = [],
      active = 0,
      size = 6;

    function process() {
      // 若果队列的长度大于等于最大值，或者队列长度为 0 ，不做任何处理
      if (active >= size || !queued.length) return;
      // 索引 + 1
      active++;
      // 对了头部出列，并调用给方法
      queued.pop()();
    }

    // 删除队列中的某个元素，删除成功返回true, 失败返回false
    function dequeue(send) {
      // 遍历队列
      for (var i = 0; i < queued.length; i++) {
        if (queued[i] == send) {
          queued.splice(i, 1);
          return true;
        }
      }
      return false;
    }

    function request(url, callback, mimeType) {
      var req;

      // 发送XMLHttpRequest 请求
      function send() {
        req = new XMLHttpRequest();
        if (mimeType && req.overrideMimeType) {
          req.overrideMimeType(mimeType);
        }
        req.open("GET", url, true);
        req.onreadystatechange = function (e) {
          if (req.readyState == 4) {
            // 完成一个请求 active -1
            active--;
            // 请求状态在20X 调用回调函数
            if (req.status < 300) callback(req);
            // 变更请求的队列
            process();
          }
        };
        req.send(null);
      }

      function abort(hard) {
        // 忽略某个请求，直接删除掉请求列表中该值
        if (dequeue(send)) return true;
        // 如果不在请求列表中，可能在请求中，调用abort 方法忽略
        if (hard && req) {
          req.abort();
          return true;
        }
        return false;
      }
      // 存储到请求队列中
      queued.push(send);
      // 变更请求状态
      process();
      return { abort: abort };
    }

    // text 内容请求
    function text(url, callback, mimeType) {
      return request(
        url,
        function (req) {
          if (req.responseText) callback(req.responseText);
        },
        mimeType
      );
    }

    /*
     * We the override MIME type here so that you can load local files; some
     * browsers don't assign a proper MIME type for local files.
     */
    // JSON 数据请求
    function json(url, callback) {
      return request(
        url,
        function (req) {
          if (req.responseText) callback(JSON.parse(req.responseText));
        },
        "application/json"
      );
    }

    // XML 数据请求
    function xml(url, callback) {
      return request(
        url,
        function (req) {
          if (req.responseXML) callback(req.responseXML);
        },
        "application/xml"
      );
    }

    // IMG 图片的请求
    function image(image, src, callback) {
      var img;

      function send() {
        // 创建一个Img对象
        img = document.createElement("img");
        // 出错处理
        img.onerror = function () {
          active--;
          process();
        };
        // 加载完成处理
        img.onload = function () {
          active--;
          // 回调传入刚加载完成的图片对象
          callback(img);
          process();
        };
        img.src = src;
        // 设置图片的href 值为src值
        image.setAttributeNS(po.ns.xlink, "href", src);
      }

      function abort(hard) {
        // 删除该加载器
        if (dequeue(send)) return true;
        // 强制停止请求
        if (hard && img) {
          img.src = "about:";
          return true;
        } // cancels request
        return false;
      }

      queued.push(send);
      process();
      return { abort: abort };
    }

    return { text: text, xml: xml, json: json, image: image };
  })();
  po.map = function () {
    var map = {},
      // 地图容器
      container,
      size,
      sizeActual = zero,
      sizeRadius = zero, // sizeActual / 2
      // 瓦片大小
      tileSize = { x: 256, y: 256 },
      // 默认地图中心
      center = { lat: 37.76487, lon: -122.41948 },
      // 默认地图等级
      zoom = 12,
      // 默认微调缩放 0
      zoomFraction = 0,
      // 缩放因子
      zoomFactor = 1, // Math.pow(2, zoomFraction)
      // 缩放等级范围
      zoomRange = [1, 18],
      // 旋转角度
      angle = 0,
      angleCos = 1, // Math.cos(angle)
      angleSin = 0, // Math.sin(angle)
      angleCosi = 1, // Math.cos(-angle)
      angleSini = 0, // Math.sin(-angle)
      // 纬度 【-180 180】
      ymin = -180, // lat2y(centerRange[0].lat)
      ymax = 180; // lat2y(centerRange[1].lat)

    var centerRange = [
      { lat: y2lat(ymin), lon: -Infinity },
      { lat: y2lat(ymax), lon: Infinity },
    ];

    // 将 经纬度 转化为 { column:number, row: number, zoom:number}
    map.locationCoordinate = function (l) {
      var c = po.map.locationCoordinate(l),
        k = Math.pow(2, zoom);
      c.column *= k;
      c.row *= k;
      c.zoom += zoom;
      return c;
    };

    map.coordinateLocation = po.map.coordinateLocation;

    /**
     * 瓦片坐标位置 转换为 屏幕位置
     * @param {*} tileCenter
     * @param {*} c
     * @returns
     */
    map.coordinatePoint = function (tileCenter, c) {
      var kc = Math.pow(2, zoom - c.zoom),
        kt = Math.pow(2, zoom - tileCenter.zoom),
        dx = (c.column * kc - tileCenter.column * kt) * tileSize.x * zoomFactor,
        dy = (c.row * kc - tileCenter.row * kt) * tileSize.y * zoomFactor;
      return {
        x: sizeRadius.x + angleCos * dx - angleSin * dy,
        y: sizeRadius.y + angleSin * dx + angleCos * dy,
      };
    };
    /**
     * 将一个像素位置 转换到  瓦片空间下
     * @param {column, row zoom} tileCenter
     * @param {x,y} p
     * @returns {column, row zoom}
     */
    map.pointCoordinate = function (tileCenter, p) {
      // 默认 zoom == tileCenter.zoom kt = 1
      var kt = Math.pow(2, zoom - tileCenter.zoom),
        // 默认 zoomFactor = 1 sizeRadius 是地图大小的一半
        dx = (p.x - sizeRadius.x) / zoomFactor,
        dy = (p.y - sizeRadius.y) / zoomFactor;
      return {
        column: tileCenter.column * kt + (angleCosi * dx - angleSini * dy) / tileSize.x,
        row: tileCenter.row * kt + (angleSini * dx + angleCosi * dy) / tileSize.y,
        zoom: zoom,
      };
    };

    /**
     * 返回屏幕空间的坐标
     * @param {*} l 经纬度
     * @returns
     */
    map.locationPoint = function (l) {
      var k = Math.pow(2, zoom + zoomFraction - 3) / 45,
        dx = (l.lon - center.lon) * k * tileSize.x,
        dy = (lat2y(center.lat) - lat2y(l.lat)) * k * tileSize.y;
      return {
        x: sizeRadius.x + angleCos * dx - angleSin * dy,
        y: sizeRadius.y + angleSin * dx + angleCos * dy,
      };
    };

    /**
     * 屏幕坐标转换为经纬度
     * @param {*} p 屏幕坐标点
     * @returns
     */
    map.pointLocation = function (p) {
      var k = 45 / Math.pow(2, zoom + zoomFraction - 3),
        dx = (p.x - sizeRadius.x) * k,
        dy = (p.y - sizeRadius.y) * k;
      return {
        lon: center.lon + (angleCosi * dx - angleSini * dy) / tileSize.x,
        lat: y2lat(lat2y(center.lat) - (angleSini * dx + angleCosi * dy) / tileSize.y),
      };
    };
    // 调整zoom
    function rezoom() {
      // 默认的范围【1,18】
      if (zoomRange) {
        // 将zoom值调整到zoomRange范围内
        if (zoom < zoomRange[0]) zoom = zoomRange[0];
        else if (zoom > zoomRange[1]) zoom = zoomRange[1];
      }
      // zoom 缩放的小数范围
      zoomFraction = zoom - (zoom = Math.round(zoom));
      // 放大因子
      zoomFactor = Math.pow(2, zoomFraction);
    }

    function recenter() {
      if (!centerRange) return;
      var k = 45 / Math.pow(2, zoom + zoomFraction - 3);

      // constrain latitude
      // 计算旋转后的 y 值
      var y = Math.max(
          Math.abs(angleSin * sizeRadius.x + angleCos * sizeRadius.y),
          Math.abs(angleSini * sizeRadius.x + angleCosi * sizeRadius.y)
        ),
        // 默认值 ymin=-180 ymax=180 tileSize = {256,256}
        // 计算结果为 lat0 = -85    lat1 = 85
        lat0 = y2lat(ymin - (y * k) / tileSize.y),
        lat1 = y2lat(ymax + (y * k) / tileSize.y);
      // 规范化中心在 【-85， 85】 之间
      center.lat = Math.max(lat0, Math.min(lat1, center.lat));

      // constrain longitude
      // 计算旋转后的 x 值
      var x = Math.max(
          Math.abs(angleSin * sizeRadius.y + angleCos * sizeRadius.x),
          Math.abs(angleSini * sizeRadius.y + angleCosi * sizeRadius.x)
        ),
        // 默认值 centerRange[0].lon = -Infinity,  centerRange[1].lon = Infinity
        // 计算结果 lon0 = -Infinity  lon1 = Infinity
        lon0 = centerRange[0].lon - (x * k) / tileSize.x,
        lon1 = centerRange[1].lon + (x * k) / tileSize.x;
      // 规范化经度范围，默认情况下
      center.lon = Math.max(lon0, Math.min(lon1, center.lon));
    }

    // a place to capture mouse events if no tiles exist
    var rect = po.svg("rect");
    rect.setAttribute("visibility", "hidden");
    rect.setAttribute("pointer-events", "all");

    // x 是一个SVG dom 对象，或者和设置dom对象
    map.container = function (x) {
      if (!arguments.length) return container;
      container = x;
      container.setAttribute("class", "map");
      // 在SVGdom 对象中插入一个rect 对象
      container.appendChild(rect);
      // 调整map 的大小
      return map.resize(); // infer size
    };

    map.focusableParent = function () {
      for (var p = container; p; p = p.parentNode) {
        if (p.tabIndex >= 0) return p;
      }
      return window;
    };

    map.mouse = function (e) {
      var point = (container.ownerSVGElement || container).createSVGPoint();
      if (bug44083 < 0 && (window.scrollX || window.scrollY)) {
        var svg = document.body.appendChild(po.svg("svg"));
        svg.style.position = "absolute";
        svg.style.top = svg.style.left = "0px";
        var ctm = svg.getScreenCTM();
        bug44083 = !(ctm.f || ctm.e);
        document.body.removeChild(svg);
      }
      if (bug44083) {
        point.x = e.pageX;
        point.y = e.pageY;
      } else {
        point.x = e.clientX;
        point.y = e.clientY;
      }
      return point.matrixTransform(container.getScreenCTM().inverse());
    };
    // 设置 或 获取 size 大小
    map.size = function (x) {
      if (!arguments.length) return sizeActual;
      size = x;
      return map.resize(); // size tiles
    };

    map.resize = function () {
      // 如果没有设置size
      if (!size) {
        // 设置属性宽度和高度为100%
        rect.setAttribute("width", "100%");
        rect.setAttribute("height", "100%");
        // 返回{ x:number, y:number, width:number, height:number } 包围盒大小
        b = rect.getBBox();
        // 设置实际的包围盒大小
        sizeActual = { x: b.width, y: b.height };
        // 将map 添加到resizer.maps 数组中
        resizer.add(map);
      } else {
        // 如果存在，size值就是真实的宽高
        sizeActual = size;
        // 将map 从resizer.maps 数组中 移除
        resizer.remove(map);
      }
      // 设置 矩阵的宽和高
      rect.setAttribute("width", sizeActual.x);
      rect.setAttribute("height", sizeActual.y);
      // sizeRadius 为实际大小的一半
      sizeRadius = { x: sizeActual.x / 2, y: sizeActual.y / 2 };
      // 根据旋转值，重新计算了中心位置的经纬度
      recenter();
      // 派发 resize 事件
      map.dispatch({ type: "resize" });
      return map;
    };

    //设置 或 获取 瓦片的大小
    map.tileSize = function (x) {
      if (!arguments.length) return tileSize;
      tileSize = x;
      // 触发瓦片的move事件
      map.dispatch({ type: "move" });
      return map;
    };
    // 设置 与 获取 中心的经纬度值 x:{lon:number, lat:number }
    map.center = function (x) {
      if (!arguments.length) return center;
      center = x;
      // 规范化中心经纬度值
      recenter();
      // 派发move 事件
      map.dispatch({ type: "move" });
      return map;
    };

    map.panBy = function (x) {
      var k = 45 / Math.pow(2, zoom + zoomFraction - 3),
        dx = x.x * k,
        dy = x.y * k;
      return map.center({
        lon: center.lon + (angleSini * dy - angleCosi * dx) / tileSize.x,
        lat: y2lat(lat2y(center.lat) + (angleSini * dx + angleCosi * dy) / tileSize.y),
      });
    };

    map.centerRange = function (x) {
      if (!arguments.length) return centerRange;
      centerRange = x;
      if (centerRange) {
        ymin = centerRange[0].lat > -90 ? lat2y(centerRange[0].lat) : -Infinity;
        ymax = centerRange[0].lat < 90 ? lat2y(centerRange[1].lat) : Infinity;
      } else {
        ymin = -Infinity;
        ymax = Infinity;
      }
      recenter();
      map.dispatch({ type: "move" });
      return map;
    };
    // 设置 或 获取 zoom 的大小
    map.zoom = function (x) {
      if (!arguments.length) return zoom + zoomFraction;
      zoom = x;
      // 根据放大值，规范化在放大范围内，并调整放大的因子 zoomFactor
      rezoom();
      // 重新设置中心位置
      return map.center(center);
    };

    map.zoomBy = function (z, x0, l) {
      if (arguments.length < 2) return map.zoom(zoom + zoomFraction + z);

      // compute the location of x0
      if (arguments.length < 3) l = map.pointLocation(x0);

      // update the zoom level
      zoom = zoom + zoomFraction + z;
      rezoom();

      // compute the new point of the location
      var x1 = map.locationPoint(l);

      return map.panBy({ x: x0.x - x1.x, y: x0.y - x1.y });
    };

    map.zoomRange = function (x) {
      if (!arguments.length) return zoomRange;
      zoomRange = x;
      return map.zoom(zoom + zoomFraction);
    };

    map.extent = function (x) {
      if (!arguments.length)
        return [map.pointLocation({ x: 0, y: sizeActual.y }), map.pointLocation({ x: sizeActual.x, y: 0 })];

      // compute the extent in points, scale factor, and center
      var bl = map.locationPoint(x[0]),
        tr = map.locationPoint(x[1]),
        k = Math.max((tr.x - bl.x) / sizeActual.x, (bl.y - tr.y) / sizeActual.y),
        l = map.pointLocation({ x: (bl.x + tr.x) / 2, y: (bl.y + tr.y) / 2 });

      // update the zoom level
      zoom = zoom + zoomFraction - Math.log(k) / Math.LN2;
      rezoom();

      // set the new center
      return map.center(l);
    };
    // 设置 或 获取 旋转弧度
    map.angle = function (x) {
      if (!arguments.length) return angle;
      angle = x;
      // 计算 cos sin
      angleCos = Math.cos(angle);
      angleSin = Math.sin(angle);
      // 计算 -值 的cos sin
      angleCosi = Math.cos(-angle);
      angleSini = Math.sin(-angle);
      // 规范化中心点
      recenter();
      map.dispatch({ type: "move" });
      return map;
    };
    // 添加一个layer
    map.add = function (x) {
      x.map(map);
      return map;
    };

    map.remove = function (x) {
      x.map(null);
      return map;
    };

    map.dispatch = po.dispatch(map);

    return map;
  };

  function resizer(e) {
    for (var i = 0; i < resizer.maps.length; i++) {
      resizer.maps[i].resize();
    }
  }

  resizer.maps = [];

  resizer.add = function (map) {
    for (var i = 0; i < resizer.maps.length; i++) {
      if (resizer.maps[i] == map) return;
    }
    resizer.maps.push(map);
  };

  resizer.remove = function (map) {
    for (var i = 0; i < resizer.maps.length; i++) {
      if (resizer.maps[i] == map) {
        resizer.maps.splice(i, 1);
        return;
      }
    }
  };

  // Note: assumes single window (no frames, iframes, etc.)!
  if (window.addEventListener) {
    window.addEventListener("resize", resizer, false);
    window.addEventListener("load", resizer, false);
  }

  // See http://wiki.openstreetmap.org/wiki/Mercator

  // y 值转换为纬度
  function y2lat(y) {
    return (360 / Math.PI) * Math.atan(Math.exp((y * Math.PI) / 180)) - 90;
  }

  function lat2y(lat) {
    // Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) 弧度
    // Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI 角度
    // (Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI)/180 ==》转为正常墨卡托坐标原点为中央经线和赤道的交点，-1-1范围的墨卡托坐标

    return (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  }

  /**
   * 经纬度，转换为瓦片坐标
   * @param {*} l 经纬度
   * @returns
   */
  po.map.locationCoordinate = function (l) {
    var k = 1 / 360;
    return {
      column: (l.lon + 180) * k, // [0, 1]之间
      row: (180 - lat2y(l.lat)) * k, // [0,1]之间
      zoom: 0,
    };
  };

  // 当zoom =3  k = 45  column  = 0.5 ;  lng = 45 * 0.5 - 180  row = 0.5 lat = y2lat(180 - 45 *0.5)
  /**
   * 瓦片坐标，转换为经纬度
   * @param {*} c 瓦片坐标
   * @returns
   */
  po.map.coordinateLocation = function (c) {
    var k = 45 / Math.pow(2, c.zoom - 3);
    return {
      lon: k * c.column - 180,
      lat: y2lat(180 - k * c.row),
    };
  };

  // https://bugs.webkit.org/show_bug.cgi?id=44083
  var bug44083 = /WebKit/.test(navigator.userAgent) ? -1 : 0;
  po.layer = function (load, unload) {
    var layer = {},
      // 设置缓存大小512
      cache = (layer.cache = po.cache(load, unload).size(512)),
      tile = true,
      visible = true,
      zoom,
      id,
      map,
      // 创建一个g 元素
      container = po.svg("g"),
      transform,
      levelZoom,
      levels = {};

    container.setAttribute("class", "layer");
    // 存放【-4，-1】层的 g 元素，
    for (var i = -4; i <= -1; i++) levels[i] = container.appendChild(po.svg("g"));
    // 存放 [2, 1] 层的 g 元素
    for (var i = 2; i >= 1; i--) levels[i] = container.appendChild(po.svg("g"));
    // 存放 0 层 g 在最上面
    levels[0] = container.appendChild(po.svg("g"));

    // 放大
    function zoomIn(z) {
      // levels0的兄弟节点
      var end = levels[0].nextSibling;
      // 当前等级放大到指定的等级
      for (; levelZoom < z; levelZoom++) {
        // -4, -3, -2, -1, +2, +1, =0 // current order
        // -3, -2, -1, +2, +1, =0, -4 // insertBefore(-4, end)
        // -3, -2, -1, +1, =0, -4, +2 // insertBefore(+2, end)
        // -3, -2, -1, =0, -4, +2, +1 // insertBefore(+1, end)
        // -4, -3, -2, -1, +2, +1, =0 // relabel
        container.insertBefore(levels[-4], end);
        container.insertBefore(levels[2], end);
        container.insertBefore(levels[1], end);
        var t = levels[-4];
        for (var dz = -4; dz < 2; ) levels[dz] = levels[++dz];
        levels[dz] = t;
      }
    }
    // 缩小
    function zoomOut(z) {
      var end = levels[0].nextSibling;
      for (; levelZoom > z; levelZoom--) {
        // -4, -3, -2, -1, +2, +1, =0 // current order
        // -4, -3, -2, +2, +1, =0, -1 // insertBefore(-1, end)
        // +2, -4, -3, -2, +1, =0, -1 // insertBefore(+2, -4)
        // -4, -3, -2, -1, +2, +1, =0 // relabel
        container.insertBefore(levels[-1], end);
        container.insertBefore(levels[2], levels[-4]);
        var t = levels[2];
        for (var dz = 2; dz > -4; ) levels[dz] = levels[--dz];
        levels[dz] = t;
      }
    }

    function move() {
      var map = layer.map(), // in case the layer is removed
        mapZoom = map.zoom(),
        // 距离最近的一个zoom等级的偏差
        mapZoomFraction = mapZoom - (mapZoom = Math.round(mapZoom)),
        mapSize = map.size(),
        mapAngle = map.angle(),
        tileSize = map.tileSize(),
        // 根据指定的经纬度，转为{column, row ,zoom}
        tileCenter = map.locationCoordinate(map.center());

      // set the layer zoom levels
      // 默认 levelZoom = undefined, 将 map的等级赋给 levelZoom
      if (levelZoom != mapZoom) {
        if (levelZoom < mapZoom) zoomIn(mapZoom);
        else if (levelZoom > mapZoom) zoomOut(mapZoom);
        else levelZoom = mapZoom;
        // 设置 -4 到 2 g 元素的zoom
        // example: <g class="zoom-4 zoom0" transform="scale(16)"></g>
        for (var z = -4; z <= 2; z++) {
          var l = levels[z];
          l.setAttribute("class", "zoom" + (z < 0 ? "" : "+") + z + " zoom" + (mapZoom + z));
          l.setAttribute("transform", "scale(" + Math.pow(2, -z) + ")");
        }
      }

      // set the layer transform
      // 设置layer 容器，平移 及旋转
      container.setAttribute(
        "transform",
        // 平移瓦片尺寸的一半
        "translate(" +
          mapSize.x / 2 +
          "," +
          mapSize.y / 2 +
          ")" +
          (mapAngle ? "rotate(" + (mapAngle / Math.PI) * 180 + ")" : "") +
          (mapZoomFraction ? "scale(" + Math.pow(2, mapZoomFraction) + ")" : "") +
          (transform ? transform.zoomFraction(mapZoomFraction) : "")
      );

      // get the coordinates of the four corners
      // 得到四个角的坐标，这里需要知道坐标系Y轴 是向下还是向上
      // 左下
      var c0 = map.pointCoordinate(tileCenter, zero),
        // 右下
        c1 = map.pointCoordinate(tileCenter, { x: mapSize.x, y: 0 }),
        // 右上
        c2 = map.pointCoordinate(tileCenter, mapSize),
        // 左上
        c3 = map.pointCoordinate(tileCenter, { x: 0, y: mapSize.y });

      // round to pixel boundary to avoid anti-aliasing artifacts
      // 四舍五入 避免锯齿
      if (!mapZoomFraction && !mapAngle && !transform) {
        // x & 1 偶数为 0 奇数为 1， 奇数就+0.5
        tileCenter.column = (Math.round(tileSize.x * tileCenter.column) + (mapSize.x & 1) / 2) / tileSize.x;
        tileCenter.row = (Math.round(tileSize.y * tileCenter.row) + (mapSize.y & 1) / 2) / tileSize.y;
      }

      // layer-specific coordinate transform
      if (transform) {
        c0 = transform.unapply(c0);
        c1 = transform.unapply(c1);
        c2 = transform.unapply(c2);
        c3 = transform.unapply(c3);
        tileCenter = transform.unapply(tileCenter);
      }

      // layer-specific zoom transform
      var tileLevel = zoom ? zoom(c0.zoom) - c0.zoom : 0;
      if (tileLevel) {
        var k = Math.pow(2, tileLevel);
        c0.column *= k;
        c0.row *= k;
        c1.column *= k;
        c1.row *= k;
        c2.column *= k;
        c2.row *= k;
        c3.column *= k;
        c3.row *= k;
        c0.zoom = c1.zoom = c2.zoom = c3.zoom += tileLevel;
      }

      // tile-specific projection
      /**
       *
       * @param {zoom:number,row:number,column:number,key:string,} c Tile 对象
       * @returns
       */
      function projection(c) {
        var zoom = c.zoom,
          max = zoom < 0 ? 1 : 1 << zoom,
          column = c.column % max,
          row = c.row;
        if (column < 0) column += max;
        return {
          locationPoint: function (l) {
            var c = po.map.locationCoordinate(l),
              k = Math.pow(2, zoom - c.zoom);
            return {
              x: tileSize.x * (k * c.column - column),
              y: tileSize.y * (k * c.row - row),
            };
          },
        };
      }

      // record which tiles are visible
      // 从缓存中返回所有锁定的tile
      var oldLocks = cache.locks(),
        newLocks = {};

      // reset the proxy counts
      // 初始化次数
      for (var key in oldLocks) {
        oldLocks[key].proxyCount = 0;
      }

      // load the tiles!
      // visible 默认值true  tileLevel上面计算结果是 0
      if (visible && tileLevel > -5 && tileLevel < 3) {
        var ymax = c0.zoom < 0 ? 1 : 1 << c0.zoom;
        // tile 默认值是true
        if (tile) {
          scanTriangle(c0, c1, c2, 0, ymax, scanLine);
          scanTriangle(c2, c3, c0, 0, ymax, scanLine);
        } else {
          var x = Math.floor((c0.column + c2.column) / 2),
            y = Math.max(0, Math.min(ymax - 1, Math.floor((c1.row + c3.row) / 2))),
            z = Math.min(4, c0.zoom);
          x = (x >> z) << z;
          y = (y >> z) << z;
          scanLine(x, x + 1, y);
        }
      }

      // scan-line conversion
      function scanLine(x0, x1, y) {
        var z = c0.zoom,
          z0 = 2 - tileLevel,
          z1 = 4 + tileLevel;

        for (var x = x0; x < x1; x++) {
          // 加载 x0到x1的瓦片
          var t = cache.load({ column: x, row: y, zoom: z }, projection);
          if (!t.ready && !(t.key in newLocks)) {
            t.proxyRefs = {};
            var c, full, proxy;

            // downsample high-resolution tiles
            for (var dz = 1; dz <= z0; dz++) {
              full = true;
              for (var dy = 0, k = 1 << dz; dy <= k; dy++) {
                for (var dx = 0; dx <= k; dx++) {
                  proxy = cache.peek(
                    (c = {
                      column: (x << dz) + dx,
                      row: (y << dz) + dy,
                      zoom: z + dz,
                    })
                  );
                  if (proxy && proxy.ready) {
                    newLocks[proxy.key] = cache.load(c);
                    proxy.proxyCount++;
                    t.proxyRefs[proxy.key] = proxy;
                  } else {
                    full = false;
                  }
                }
              }
              if (full) break;
            }

            // upsample low-resolution tiles
            if (!full) {
              for (var dz = 1; dz <= z1; dz++) {
                proxy = cache.peek(
                  (c = {
                    column: x >> dz,
                    row: y >> dz,
                    zoom: z - dz,
                  })
                );
                if (proxy && proxy.ready) {
                  newLocks[proxy.key] = cache.load(c);
                  proxy.proxyCount++;
                  t.proxyRefs[proxy.key] = proxy;
                  break;
                }
              }
            }
          }
          newLocks[t.key] = t;
        }
      }

      // position tiles
      for (var key in newLocks) {
        var t = newLocks[key],
          k = Math.pow(2, (t.level = t.zoom - tileCenter.zoom));
        t.element.setAttribute(
          "transform",
          "translate(" +
            (t.x = tileSize.x * (t.column - tileCenter.column * k)) +
            "," +
            (t.y = tileSize.y * (t.row - tileCenter.row * k)) +
            ")"
        );
      }

      // remove tiles that are no longer visible
      for (var key in oldLocks) {
        if (!(key in newLocks)) {
          var t = cache.unload(key);
          t.element.parentNode.removeChild(t.element);
          delete t.proxyRefs;
        }
      }

      // append tiles that are now visible
      for (var key in newLocks) {
        var t = newLocks[key];
        if (t.element.parentNode != levels[t.level]) {
          levels[t.level].appendChild(t.element);
          if (layer.show) layer.show(t);
        }
      }

      // flush the cache, clearing no-longer-needed tiles
      cache.flush();

      // dispatch the move event
      layer.dispatch({ type: "move" });
    }

    // remove proxy tiles when tiles load
    function cleanup(e) {
      if (e.tile.proxyRefs) {
        for (var proxyKey in e.tile.proxyRefs) {
          var proxyTile = e.tile.proxyRefs[proxyKey];
          if (--proxyTile.proxyCount <= 0 && cache.unload(proxyKey)) {
            proxyTile.element.parentNode.removeChild(proxyTile.element);
          }
        }
        delete e.tile.proxyRefs;
      }
    }
    // 将 {x:map} 对象绑定改layer, 无参获取该map
    layer.map = function (x) {
      if (!arguments.length) return map;
      // 如果改layer 已经存在map
      if (map) {
        // 判断是否是同一个map
        if (map == x) {
          // 将map 移动到最顶层，dom 最后
          container.parentNode.appendChild(container); // move to end
          return layer;
        }
        // 减除原有的  move 和 resize 事件
        map.off("move", move).off("resize", move);
        // 移除原有的container g 元素
        container.parentNode.removeChild(container);
      }
      // 保存 map 对象
      map = x;
      if (map) {
        //将layer 的容器对象添加到 map 的 容器dom 中
        map.container().appendChild(container);
        // 初始化 layer,如果定义就执行
        if (layer.init) layer.init(container);
        // 重新绑定 move resize 事件
        map.on("move", move).on("resize", move);
        // 执行一次move
        move();
      }
      return layer;
    };

    layer.container = function () {
      return container;
    };

    layer.levels = function () {
      return levels;
    };

    layer.id = function (x) {
      if (!arguments.length) return id;
      id = x;
      container.setAttribute("id", x);
      return layer;
    };

    layer.visible = function (x) {
      if (!arguments.length) return visible;
      if ((visible = x)) container.removeAttribute("visibility");
      else container.setAttribute("visibility", "hidden");
      if (map) move();
      return layer;
    };

    layer.transform = function (x) {
      if (!arguments.length) return transform;
      transform = x;
      if (map) move();
      return layer;
    };

    layer.zoom = function (x) {
      if (!arguments.length) return zoom;
      zoom =
        typeof x == "function" || x == null
          ? x
          : function () {
              return x;
            };
      if (map) move();
      return layer;
    };

    layer.tile = function (x) {
      if (!arguments.length) return tile;
      tile = x;
      if (map) move();
      return layer;
    };

    layer.reload = function () {
      cache.clear();
      if (map) move();
      return layer;
    };

    layer.dispatch = po.dispatch(layer);
    layer.on("load", cleanup);

    return layer;
  };

  // scan-line conversion
  function edge(a, b) {
    // 如果a.row > b.row , a 与 b 调换
    if (a.row > b.row) {
      var t = a;
      a = b;
      b = t;
    }
    // a.row < b.row
    return {
      x0: a.column,
      y0: a.row,
      x1: b.column,
      y1: b.row,
      dx: b.column - a.column,
      dy: b.row - a.row,
    };
  }

  // scan-line conversion
  function scanSpans(e0, e1, ymin, ymax, scanLine) {
    var y0 = Math.max(ymin, Math.floor(e1.y0)),
      y1 = Math.min(ymax, Math.ceil(e1.y1));

    // sort edges by x-coordinate
    if (
      e0.x0 == e1.x0 && e0.y0 == e1.y0
        ? e0.x0 + (e1.dy / e0.dy) * e0.dx < e1.x1
        : e0.x1 - (e1.dy / e0.dy) * e0.dx < e1.x0
    ) {
      var t = e0;
      e0 = e1;
      e1 = t;
    }

    // scan lines!
    var m0 = e0.dx / e0.dy,
      m1 = e1.dx / e1.dy,
      d0 = e0.dx > 0, // use y + 1 to compute x0
      d1 = e1.dx < 0; // use y + 1 to compute x1
    for (var y = y0; y < y1; y++) {
      var x0 = m0 * Math.max(0, Math.min(e0.dy, y + d0 - e0.y0)) + e0.x0,
        x1 = m1 * Math.max(0, Math.min(e1.dy, y + d1 - e1.y0)) + e1.x0;
      scanLine(Math.floor(x1), Math.ceil(x0), y);
    }
  }

  // scan-line conversion
  /**
   *
   * @param {column, row, zoom} a 三角形的一个点
   * @param {column, row, zoom} b 三角形的一个点
   * @param {column, row, zoom} c 三角形的一个点
   * @param { number } ymin 0
   * @param { number } ymax 1 << zoom
   * @param { function } scanLine  回调函数
   */
  function scanTriangle(a, b, c, ymin, ymax, scanLine) {
    // {x0:number,y0:number, x1:number,y1:number,dx:number,dy:number}
    // dx column的差
    // dy row的差
    var ab = edge(a, b),
      bc = edge(b, c),
      ca = edge(c, a);

    // sort edges by y-length
    // 最终结果是 ab.dy <= bc.dy <= ca.dy
    if (ab.dy > bc.dy) {
      var t = ab;
      ab = bc;
      bc = t;
    }
    if (ab.dy > ca.dy) {
      var t = ab;
      ab = ca;
      ca = t;
    }
    if (bc.dy > ca.dy) {
      var t = bc;
      bc = ca;
      ca = t;
    }

    // scan span! scan span!
    if (ab.dy) scanSpans(ca, ab, ymin, ymax, scanLine);
    if (bc.dy) scanSpans(ca, bc, ymin, ymax, scanLine);
  }
  po.image = function () {
    var image = po.layer(load, unload),
      url;

    function load(tile) {
      var element = (tile.element = po.svg("image")),
        size = image.map().tileSize();
      element.setAttribute("preserveAspectRatio", "none");
      element.setAttribute("width", size.x);
      element.setAttribute("height", size.y);

      if (typeof url == "function") {
        element.setAttribute("opacity", 0);
        var tileUrl = url(tile);
        if (tileUrl != null) {
          tile.request = po.queue.image(element, tileUrl, function (img) {
            delete tile.request;
            tile.ready = true;
            tile.img = img;
            element.removeAttribute("opacity");
            image.dispatch({ type: "load", tile: tile });
          });
        } else {
          tile.ready = true;
          image.dispatch({ type: "load", tile: tile });
        }
      } else {
        tile.ready = true;
        if (url != null) element.setAttributeNS(po.ns.xlink, "href", url);
        image.dispatch({ type: "load", tile: tile });
      }
    }

    function unload(tile) {
      if (tile.request) tile.request.abort(true);
    }

    image.url = function (x) {
      if (!arguments.length) return url;
      url = typeof x == "string" && /{.}/.test(x) ? po.url(x) : x;
      return image.reload();
    };

    return image;
  };
  po.geoJson = function (fetch) {
    var geoJson = po.layer(load, unload),
      container = geoJson.container(),
      url,
      clip = true,
      clipId = "org.polymaps." + po.id(),
      clipHref = "url(#" + clipId + ")",
      clipPath = container.insertBefore(po.svg("clipPath"), container.firstChild),
      clipRect = clipPath.appendChild(po.svg("rect")),
      scale = "auto",
      zoom = null,
      features;

    container.setAttribute("fill-rule", "evenodd");
    clipPath.setAttribute("id", clipId);

    if (!arguments.length) fetch = po.queue.json;

    function projection(proj) {
      var l = { lat: 0, lon: 0 };
      return function (coordinates) {
        l.lat = coordinates[1];
        l.lon = coordinates[0];
        var p = proj(l);
        coordinates.x = p.x;
        coordinates.y = p.y;
        return p;
      };
    }

    function geometry(o, proj) {
      return o && o.type in types && types[o.type](o, proj);
    }

    // 根据geojson 进行SVG绘制
    var types = {
      Point: function (o, proj) {
        var p = proj(o.coordinates),
          c = po.svg("circle");
        c.setAttribute("r", 4.5);
        c.setAttribute("transform", "translate(" + p.x + "," + p.y + ")");
        return c;
      },

      MultiPoint: function (o, proj) {
        var g = po.svg("g"),
          c = o.coordinates,
          p, // proj(c[i])
          x, // svg:circle
          i = -1,
          n = c.length;
        while (++i < n) {
          x = g.appendChild(po.svg("circle"));
          x.setAttribute("r", 4.5);
          x.setAttribute("transform", "translate(" + (p = proj(c[i])).x + "," + p.y + ")");
        }
        return g;
      },

      LineString: function (o, proj) {
        var x = po.svg("path"),
          d = ["M"],
          c = o.coordinates,
          p, // proj(c[i])
          i = -1,
          n = c.length;
        while (++i < n) d.push((p = proj(c[i])).x, ",", p.y, "L");
        d.pop();
        if (!d.length) return;
        x.setAttribute("d", d.join(""));
        return x;
      },

      MultiLineString: function (o, proj) {
        var x = po.svg("path"),
          d = [],
          ci = o.coordinates,
          cj, // ci[i]
          i = -1,
          j,
          n = ci.length,
          m;
        while (++i < n) {
          cj = ci[i];
          j = -1;
          m = cj.length;
          d.push("M");
          while (++j < m) d.push((p = proj(cj[j])).x, ",", p.y, "L");
          d.pop();
        }
        if (!d.length) return;
        x.setAttribute("d", d.join(""));
        return x;
      },

      Polygon: function (o, proj) {
        var x = po.svg("path"),
          d = [],
          ci = o.coordinates,
          cj, // ci[i]
          i = -1,
          j,
          n = ci.length,
          m;
        while (++i < n) {
          cj = ci[i];
          j = -1;
          m = cj.length - 1;
          d.push("M");
          while (++j < m) d.push((p = proj(cj[j])).x, ",", p.y, "L");
          d[d.length - 1] = "Z";
        }
        if (!d.length) return;
        x.setAttribute("d", d.join(""));
        return x;
      },

      MultiPolygon: function (o, proj) {
        var x = po.svg("path"),
          d = [],
          ci = o.coordinates,
          cj, // ci[i]
          ck, // cj[j]
          i = -1,
          j,
          k,
          n = ci.length,
          m,
          l;
        while (++i < n) {
          cj = ci[i];
          j = -1;
          m = cj.length;
          while (++j < m) {
            ck = cj[j];
            k = -1;
            l = ck.length - 1;
            d.push("M");
            while (++k < l) d.push((p = proj(ck[k])).x, ",", p.y, "L");
            d[d.length - 1] = "Z";
          }
        }
        if (!d.length) return;
        x.setAttribute("d", d.join(""));
        return x;
      },

      GeometryCollection: function (o, proj) {
        var g = po.svg("g"),
          i = -1,
          c = o.geometries,
          n = c.length,
          x;
        while (++i < n) {
          x = geometry(c[i], proj);
          if (x) g.appendChild(x);
        }
        return g;
      },
    };

    function rescale(o, e, k) {
      return o.type in rescales && rescales[o.type](o, e, k);
    }

    var rescales = {
      Point: function (o, e, k) {
        var p = o.coordinates;
        e.setAttribute("transform", "translate(" + p.x + "," + p.y + ")" + k);
      },

      MultiPoint: function (o, e, k) {
        var c = o.coordinates,
          i = -1,
          n = p.length,
          x = e.firstChild,
          p;
        while (++i < n) {
          p = c[i];
          x.setAttribute("transform", "translate(" + p.x + "," + p.y + ")" + k);
          x = x.nextSibling;
        }
      },
    };

    function load(tile, proj) {
      // 创建tile 元素
      var g = (tile.element = po.svg("g"));
      tile.features = [];
      //
      proj = projection(proj(tile).locationPoint);

      function update(data) {
        var updated = [];

        /* Fetch the next batch of features, if so directed. */
        if (data.next) tile.request = fetch(data.next.href, update);

        /* Convert the GeoJSON to SVG. */
        switch (data.type) {
          case "FeatureCollection": {
            for (var i = 0; i < data.features.length; i++) {
              var feature = data.features[i],
                element = geometry(feature.geometry, proj);
              if (element)
                updated.push({
                  element: g.appendChild(element),
                  data: feature,
                });
            }
            break;
          }
          case "Feature": {
            var element = geometry(data.geometry, proj);
            if (element) updated.push({ element: g.appendChild(element), data: data });
            break;
          }
          default: {
            var element = geometry(data, proj);
            if (element)
              updated.push({
                element: g.appendChild(element),
                data: { type: "Feature", geometry: data },
              });
            break;
          }
        }

        tile.ready = true;
        updated.push.apply(tile.features, updated);
        geoJson.dispatch({ type: "load", tile: tile, features: updated });
      }

      if (url != null) {
        tile.request = fetch(typeof url == "function" ? url(tile) : url, update);
      } else {
        update({ type: "FeatureCollection", features: features || [] });
      }
    }

    function unload(tile) {
      if (tile.request) tile.request.abort(true);
    }

    function move() {
      var zoom = geoJson.map().zoom(),
        tiles = geoJson.cache.locks(), // visible tiles
        key, // key in locks
        tile, // locks[key]
        features, // tile.features
        i, // current feature index
        n, // current feature count, features.length
        feature, // features[i]
        k; // scale transform
      if (scale == "fixed") {
        for (key in tiles) {
          if ((tile = tiles[key]).scale != zoom) {
            k = "scale(" + Math.pow(2, tile.zoom - zoom) + ")";
            i = -1;
            n = (features = tile.features).length;
            while (++i < n) rescale((feature = features[i]).data.geometry, feature.element, k);
            tile.scale = zoom;
          }
        }
      } else {
        for (key in tiles) {
          i = -1;
          n = (features = (tile = tiles[key]).features).length;
          while (++i < n) rescale((feature = features[i]).data.geometry, feature.element, "");
          delete tile.scale;
        }
      }
    }

    geoJson.url = function (x) {
      if (!arguments.length) return url;
      url = typeof x == "string" && /{.}/.test(x) ? po.url(x) : x;
      if (url != null) features = null;
      if (typeof url == "string") geoJson.tile(false);
      return geoJson.reload();
    };

    geoJson.features = function (x) {
      if (!arguments.length) return features;
      if ((features = x)) {
        url = null;
        geoJson.tile(false);
      }
      return geoJson.reload();
    };

    geoJson.clip = function (x) {
      if (!arguments.length) return clip;
      if (clip) container.removeChild(clipPath);
      if ((clip = x)) container.insertBefore(clipPath, container.firstChild);
      var locks = geoJson.cache.locks();
      for (var key in locks) {
        if (clip) locks[key].element.setAttribute("clip-path", clipHref);
        else locks[key].element.removeAttribute("clip-path");
      }
      return geoJson;
    };

    var __tile__ = geoJson.tile;
    geoJson.tile = function (x) {
      if (arguments.length && !x) geoJson.clip(x);
      return __tile__.apply(geoJson, arguments);
    };

    var __map__ = geoJson.map;
    geoJson.map = function (x) {
      if (x && clipRect) {
        var size = x.tileSize();
        clipRect.setAttribute("width", size.x);
        clipRect.setAttribute("height", size.y);
      }
      return __map__.apply(geoJson, arguments);
    };

    geoJson.scale = function (x) {
      if (!arguments.length) return scale;
      if ((scale = x)) geoJson.on("move", move);
      else geoJson.off("move", move);
      if (geoJson.map()) move();
      return geoJson;
    };

    geoJson.show = function (tile) {
      if (clip) tile.element.setAttribute("clip-path", clipHref);
      else tile.element.removeAttribute("clip-path");
      geoJson.dispatch({ type: "show", tile: tile, features: tile.features });
      return geoJson;
    };

    geoJson.reshow = function () {
      var locks = geoJson.cache.locks();
      for (var key in locks) geoJson.show(locks[key]);
      return geoJson;
    };

    return geoJson;
  };
  po.dblclick = function () {
    var dblclick = {},
      zoom = "mouse",
      map,
      container;

    function handle(e) {
      var z = map.zoom();
      if (e.shiftKey) z = Math.ceil(z) - z - 1;
      else z = 1 - z + Math.floor(z);
      zoom === "mouse" ? map.zoomBy(z, map.mouse(e)) : map.zoomBy(z);
    }

    dblclick.zoom = function (x) {
      if (!arguments.length) return zoom;
      zoom = x;
      return dblclick;
    };

    dblclick.map = function (x) {
      if (!arguments.length) return map;
      if (map) {
        container.removeEventListener("dblclick", handle, false);
        container = null;
      }
      if ((map = x)) {
        container = map.container();
        container.addEventListener("dblclick", handle, false);
      }
      return dblclick;
    };

    return dblclick;
  };
  po.drag = function () {
    var drag = {},
      map,
      container,
      dragging;

    function mousedown(e) {
      if (e.shiftKey) return;
      dragging = {
        x: e.clientX,
        y: e.clientY,
      };
      map.focusableParent().focus();
      e.preventDefault();
      document.body.style.setProperty("cursor", "move", null);
    }

    function mousemove(e) {
      if (!dragging) return;
      map.panBy({ x: e.clientX - dragging.x, y: e.clientY - dragging.y });
      dragging.x = e.clientX;
      dragging.y = e.clientY;
    }

    function mouseup(e) {
      if (!dragging) return;
      mousemove(e);
      dragging = null;
      document.body.style.removeProperty("cursor");
    }

    drag.map = function (x) {
      if (!arguments.length) return map;
      if (map) {
        container.removeEventListener("mousedown", mousedown, false);
        container = null;
      }
      if ((map = x)) {
        container = map.container();
        container.addEventListener("mousedown", mousedown, false);
      }
      return drag;
    };

    window.addEventListener("mousemove", mousemove, false);
    window.addEventListener("mouseup", mouseup, false);

    return drag;
  };
  po.wheel = function () {
    var wheel = {},
      timePrev = 0,
      last = 0,
      smooth = true,
      zoom = "mouse",
      location,
      map,
      container;

    function move(e) {
      location = null;
    }

    // mousewheel events are totally broken!
    // https://bugs.webkit.org/show_bug.cgi?id=40441
    // not only that, but Chrome and Safari differ in re. to acceleration!
    var inner = document.createElement("div"),
      outer = document.createElement("div");
    outer.style.visibility = "hidden";
    outer.style.top = "0px";
    outer.style.height = "0px";
    outer.style.width = "0px";
    outer.style.overflowY = "scroll";
    inner.style.height = "2000px";
    outer.appendChild(inner);
    document.body.appendChild(outer);

    function mousewheel(e) {
      var delta = e.wheelDelta || -e.detail,
        point;

      /* Detect the pixels that would be scrolled by this wheel event. */
      if (delta) {
        if (smooth) {
          try {
            outer.scrollTop = 1000;
            outer.dispatchEvent(e);
            delta = 1000 - outer.scrollTop;
          } catch (error) {
            // Derp! Hope for the best?
          }
          delta *= 0.005;
        } else {
          /* If smooth zooming is disabled, batch events into unit steps. */
          var timeNow = Date.now();
          if (timeNow - timePrev > 200) {
            delta = delta > 0 ? +1 : -1;
            timePrev = timeNow;
          } else {
            delta = 0;
          }
        }
      }

      if (delta) {
        switch (zoom) {
          case "mouse": {
            point = map.mouse(e);
            if (!location) location = map.pointLocation(point);
            map.off("move", move).zoomBy(delta, point, location).on("move", move);
            break;
          }
          case "location": {
            map.zoomBy(delta, map.locationPoint(location), location);
            break;
          }
          default: {
            // center
            map.zoomBy(delta);
            break;
          }
        }
      }

      e.preventDefault();
      return false; // for Firefox
    }

    wheel.smooth = function (x) {
      if (!arguments.length) return smooth;
      smooth = x;
      return wheel;
    };

    wheel.zoom = function (x, l) {
      if (!arguments.length) return zoom;
      zoom = x;
      location = l;
      if (map) {
        if (zoom == "mouse") map.on("move", move);
        else map.off("move", move);
      }
      return wheel;
    };

    wheel.map = function (x) {
      if (!arguments.length) return map;
      if (map) {
        container.removeEventListener("mousemove", move, false);
        container.removeEventListener("mousewheel", mousewheel, false);
        container.removeEventListener("MozMousePixelScroll", mousewheel, false);
        container = null;
        map.off("move", move);
      }
      if ((map = x)) {
        if (zoom == "mouse") map.on("move", move);
        container = map.container();
        container.addEventListener("mousemove", move, false);
        container.addEventListener("mousewheel", mousewheel, false);
        container.addEventListener("MozMousePixelScroll", mousewheel, false);
      }
      return wheel;
    };

    return wheel;
  };
  po.arrow = function () {
    var arrow = {},
      key = { left: 0, right: 0, up: 0, down: 0 },
      last = 0,
      repeatTimer,
      repeatDelay = 250,
      repeatInterval = 50,
      speed = 16,
      map,
      parent;

    function keydown(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      var now = Date.now(),
        dx = 0,
        dy = 0;
      switch (e.keyCode) {
        case 37: {
          if (!key.left) {
            last = now;
            key.left = 1;
            if (!key.right) dx = speed;
          }
          break;
        }
        case 39: {
          if (!key.right) {
            last = now;
            key.right = 1;
            if (!key.left) dx = -speed;
          }
          break;
        }
        case 38: {
          if (!key.up) {
            last = now;
            key.up = 1;
            if (!key.down) dy = speed;
          }
          break;
        }
        case 40: {
          if (!key.down) {
            last = now;
            key.down = 1;
            if (!key.up) dy = -speed;
          }
          break;
        }
        default:
          return;
      }
      if (dx || dy) map.panBy({ x: dx, y: dy });
      if (!repeatTimer && key.left | key.right | key.up | key.down) {
        repeatTimer = setInterval(repeat, repeatInterval);
      }
      e.preventDefault();
    }

    function keyup(e) {
      last = Date.now();
      switch (e.keyCode) {
        case 37:
          key.left = 0;
          break;
        case 39:
          key.right = 0;
          break;
        case 38:
          key.up = 0;
          break;
        case 40:
          key.down = 0;
          break;
        default:
          return;
      }
      if (repeatTimer && !(key.left | key.right | key.up | key.down)) {
        repeatTimer = clearInterval(repeatTimer);
      }
      e.preventDefault();
    }

    function keypress(e) {
      switch (e.charCode) {
        case 45:
        case 95:
          map.zoom(Math.ceil(map.zoom()) - 1);
          break; // - _
        case 43:
        case 61:
          map.zoom(Math.floor(map.zoom()) + 1);
          break; // = +
        default:
          return;
      }
      e.preventDefault();
    }

    function repeat() {
      if (!map) return;
      if (Date.now() < last + repeatDelay) return;
      var dx = (key.left - key.right) * speed,
        dy = (key.up - key.down) * speed;
      if (dx || dy) map.panBy({ x: dx, y: dy });
    }

    arrow.map = function (x) {
      if (!arguments.length) return map;
      if (map) {
        parent.removeEventListener("keypress", keypress, false);
        parent.removeEventListener("keydown", keydown, false);
        parent.removeEventListener("keyup", keyup, false);
        parent = null;
      }
      if ((map = x)) {
        parent = map.focusableParent();
        parent.addEventListener("keypress", keypress, false);
        parent.addEventListener("keydown", keydown, false);
        parent.addEventListener("keyup", keyup, false);
      }
      return arrow;
    };

    arrow.speed = function (x) {
      if (!arguments.length) return speed;
      speed = x;
      return arrow;
    };

    return arrow;
  };
  po.hash = function () {
    var hash = {},
      s0, // cached location.hash
      lat = 90 - 1e-8, // allowable latitude range
      map;

    var parser = function (map, s) {
      var args = s.split("/").map(Number);
      if (args.length < 3 || args.some(isNaN)) return true; // replace bogus hash
      else {
        var size = map.size();
        map.zoomBy(
          args[0] - map.zoom(),
          { x: size.x / 2, y: size.y / 2 },
          { lat: Math.min(lat, Math.max(-lat, args[1])), lon: args[2] }
        );
      }
    };

    var formatter = function (map) {
      var center = map.center(),
        zoom = map.zoom(),
        precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));
      return "#" + zoom.toFixed(2) + "/" + center.lat.toFixed(precision) + "/" + center.lon.toFixed(precision);
    };

    function move() {
      var s1 = formatter(map);
      if (s0 !== s1) location.replace((s0 = s1)); // don't recenter the map!
    }

    function hashchange() {
      if (location.hash === s0) return; // ignore spurious hashchange events
      if (parser(map, (s0 = location.hash).substring(1))) move(); // replace bogus hash
    }

    hash.map = function (x) {
      if (!arguments.length) return map;
      if (map) {
        map.off("move", move);
        window.removeEventListener("hashchange", hashchange, false);
      }
      if ((map = x)) {
        map.on("move", move);
        window.addEventListener("hashchange", hashchange, false);
        location.hash ? hashchange() : move();
      }
      return hash;
    };

    hash.parser = function (x) {
      if (!arguments.length) return parser;
      parser = x;
      return hash;
    };

    hash.formatter = function (x) {
      if (!arguments.length) return formatter;
      formatter = x;
      return hash;
    };

    return hash;
  };
  po.touch = function () {
    var touch = {},
      map,
      container,
      rotate = false,
      last = 0,
      zoom,
      angle,
      locations = {}; // touch identifier -> location

    window.addEventListener("touchmove", touchmove, false);

    function touchstart(e) {
      var i = -1,
        n = e.touches.length,
        t = Date.now();

      // doubletap detection
      if (n == 1 && t - last < 300) {
        var z = map.zoom();
        map.zoomBy(1 - z + Math.floor(z), map.mouse(e.touches[0]));
        e.preventDefault();
      }
      last = t;

      // store original zoom & touch locations
      zoom = map.zoom();
      angle = map.angle();
      while (++i < n) {
        t = e.touches[i];
        locations[t.identifier] = map.pointLocation(map.mouse(t));
      }
    }

    function touchmove(e) {
      switch (e.touches.length) {
        case 1: {
          // single-touch pan
          var t0 = e.touches[0];
          map.zoomBy(0, map.mouse(t0), locations[t0.identifier]);
          e.preventDefault();
          break;
        }
        case 2: {
          // double-touch pan + zoom + rotate
          var t0 = e.touches[0],
            t1 = e.touches[1],
            p0 = map.mouse(t0),
            p1 = map.mouse(t1),
            p2 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, // center point
            c0 = po.map.locationCoordinate(locations[t0.identifier]),
            c1 = po.map.locationCoordinate(locations[t1.identifier]),
            c2 = {
              row: (c0.row + c1.row) / 2,
              column: (c0.column + c1.column) / 2,
              zoom: 0,
            },
            l2 = po.map.coordinateLocation(c2); // center location
          map.zoomBy(Math.log(e.scale) / Math.LN2 + zoom - map.zoom(), p2, l2);
          if (rotate) map.angle((e.rotation / 180) * Math.PI + angle);
          e.preventDefault();
          break;
        }
      }
    }

    touch.rotate = function (x) {
      if (!arguments.length) return rotate;
      rotate = x;
      return touch;
    };

    touch.map = function (x) {
      if (!arguments.length) return map;
      if (map) {
        container.removeEventListener("touchstart", touchstart, false);
        container = null;
      }
      if ((map = x)) {
        container = map.container();
        container.addEventListener("touchstart", touchstart, false);
      }
      return touch;
    };

    return touch;
  };
  // Default map controls.
  po.interact = function () {
    var interact = {},
      drag = po.drag(),
      wheel = po.wheel(),
      dblclick = po.dblclick(),
      touch = po.touch(),
      arrow = po.arrow();

    interact.map = function (x) {
      drag.map(x);
      wheel.map(x);
      dblclick.map(x);
      touch.map(x);
      arrow.map(x);
      return interact;
    };

    return interact;
  };
  po.compass = function () {
    var compass = {},
      g = po.svg("g"),
      ticks = {},
      r = 30,
      speed = 16,
      last = 0,
      repeatDelay = 250,
      repeatInterval = 50,
      position = "top-left", // top-left, top-right, bottom-left, bottom-right
      zoomStyle = "small", // none, small, big
      zoomContainer,
      panStyle = "small", // none, small
      panTimer,
      panDirection,
      panContainer,
      drag,
      dragRect = po.svg("rect"),
      map,
      container,
      window;

    g.setAttribute("class", "compass");
    dragRect.setAttribute("class", "back fore");
    dragRect.setAttribute("pointer-events", "none");
    dragRect.setAttribute("display", "none");

    function panStart(e) {
      g.setAttribute("class", "compass active");
      if (!panTimer) panTimer = setInterval(panRepeat, repeatInterval);
      if (panDirection) map.panBy(panDirection);
      last = Date.now();
      return cancel(e);
    }

    function panRepeat() {
      if (panDirection && Date.now() > last + repeatDelay) {
        map.panBy(panDirection);
      }
    }

    function mousedown(e) {
      if (e.shiftKey) {
        drag = { x0: map.mouse(e) };
        map.focusableParent().focus();
        return cancel(e);
      }
    }

    function mousemove(e) {
      if (!drag) return;
      drag.x1 = map.mouse(e);
      dragRect.setAttribute("x", Math.min(drag.x0.x, drag.x1.x));
      dragRect.setAttribute("y", Math.min(drag.x0.y, drag.x1.y));
      dragRect.setAttribute("width", Math.abs(drag.x0.x - drag.x1.x));
      dragRect.setAttribute("height", Math.abs(drag.x0.y - drag.x1.y));
      dragRect.removeAttribute("display");
    }

    function mouseup(e) {
      g.setAttribute("class", "compass");
      if (drag) {
        if (drag.x1) {
          map.extent([
            map.pointLocation({
              x: Math.min(drag.x0.x, drag.x1.x),
              y: Math.max(drag.x0.y, drag.x1.y),
            }),
            map.pointLocation({
              x: Math.max(drag.x0.x, drag.x1.x),
              y: Math.min(drag.x0.y, drag.x1.y),
            }),
          ]);
          dragRect.setAttribute("display", "none");
        }
        drag = null;
      }
      if (panTimer) {
        clearInterval(panTimer);
        panTimer = 0;
      }
    }

    function panBy(x) {
      return function () {
        x ? this.setAttribute("class", "active") : this.removeAttribute("class");
        panDirection = x;
      };
    }

    function zoomBy(x) {
      return function (e) {
        g.setAttribute("class", "compass active");
        var z = map.zoom();
        map.zoom(x < 0 ? Math.ceil(z) - 1 : Math.floor(z) + 1);
        return cancel(e);
      };
    }

    function zoomTo(x) {
      return function (e) {
        map.zoom(x);
        return cancel(e);
      };
    }

    function zoomOver() {
      this.setAttribute("class", "active");
    }

    function zoomOut() {
      this.removeAttribute("class");
    }

    function cancel(e) {
      e.stopPropagation();
      e.preventDefault();
      return false;
    }

    function pan(by) {
      var x = Math.SQRT1_2 * r,
        y = r * 0.7,
        z = r * 0.2,
        g = po.svg("g"),
        dir = g.appendChild(po.svg("path")),
        chv = g.appendChild(po.svg("path"));
      dir.setAttribute("class", "direction");
      dir.setAttribute("pointer-events", "all");
      dir.setAttribute("d", "M0,0L" + x + "," + x + "A" + r + "," + r + " 0 0,1 " + -x + "," + x + "Z");
      chv.setAttribute("class", "chevron");
      chv.setAttribute("d", "M" + z + "," + (y - z) + "L0," + y + " " + -z + "," + (y - z));
      chv.setAttribute("pointer-events", "none");
      g.addEventListener("mousedown", panStart, false);
      g.addEventListener("mouseover", panBy(by), false);
      g.addEventListener("mouseout", panBy(null), false);
      g.addEventListener("dblclick", cancel, false);
      return g;
    }

    function zoom(by) {
      var x = r * 0.4,
        y = x / 2,
        g = po.svg("g"),
        back = g.appendChild(po.svg("path")),
        dire = g.appendChild(po.svg("path")),
        chev = g.appendChild(po.svg("path")),
        fore = g.appendChild(po.svg("path"));
      back.setAttribute("class", "back");
      back.setAttribute("d", "M" + -x + ",0V" + -x + "A" + x + "," + x + " 0 1,1 " + x + "," + -x + "V0Z");
      dire.setAttribute("class", "direction");
      dire.setAttribute("d", back.getAttribute("d"));
      chev.setAttribute("class", "chevron");
      chev.setAttribute("d", "M" + -y + "," + -x + "H" + y + (by > 0 ? "M0," + (-x - y) + "V" + -y : ""));
      fore.setAttribute("class", "fore");
      fore.setAttribute("fill", "none");
      fore.setAttribute("d", back.getAttribute("d"));
      g.addEventListener("mousedown", zoomBy(by), false);
      g.addEventListener("mouseover", zoomOver, false);
      g.addEventListener("mouseout", zoomOut, false);
      g.addEventListener("dblclick", cancel, false);
      return g;
    }

    function tick(i) {
      var x = r * 0.2,
        y = r * 0.4,
        g = po.svg("g"),
        back = g.appendChild(po.svg("rect")),
        chev = g.appendChild(po.svg("path"));
      back.setAttribute("pointer-events", "all");
      back.setAttribute("fill", "none");
      back.setAttribute("x", -y);
      back.setAttribute("y", -0.75 * y);
      back.setAttribute("width", 2 * y);
      back.setAttribute("height", 1.5 * y);
      chev.setAttribute("class", "chevron");
      chev.setAttribute("d", "M" + -x + ",0H" + x);
      g.addEventListener("mousedown", zoomTo(i), false);
      g.addEventListener("dblclick", cancel, false);
      return g;
    }

    function move() {
      var x = r + 6,
        y = x,
        size = map.size();
      switch (position) {
        case "top-left":
          break;
        case "top-right":
          x = size.x - x;
          break;
        case "bottom-left":
          y = size.y - y;
          break;
        case "bottom-right":
          x = size.x - x;
          y = size.y - y;
          break;
      }
      g.setAttribute("transform", "translate(" + x + "," + y + ")");
      dragRect.setAttribute("transform", "translate(" + -x + "," + -y + ")");
      for (var i in ticks) {
        i == map.zoom() ? ticks[i].setAttribute("class", "active") : ticks[i].removeAttribute("class");
      }
    }

    function draw() {
      while (g.lastChild) g.removeChild(g.lastChild);

      g.appendChild(dragRect);

      if (panStyle != "none") {
        panContainer = g.appendChild(po.svg("g"));
        panContainer.setAttribute("class", "pan");

        var back = panContainer.appendChild(po.svg("circle"));
        back.setAttribute("class", "back");
        back.setAttribute("r", r);

        var s = panContainer.appendChild(pan({ x: 0, y: -speed }));
        s.setAttribute("transform", "rotate(0)");

        var w = panContainer.appendChild(pan({ x: speed, y: 0 }));
        w.setAttribute("transform", "rotate(90)");

        var n = panContainer.appendChild(pan({ x: 0, y: speed }));
        n.setAttribute("transform", "rotate(180)");

        var e = panContainer.appendChild(pan({ x: -speed, y: 0 }));
        e.setAttribute("transform", "rotate(270)");

        var fore = panContainer.appendChild(po.svg("circle"));
        fore.setAttribute("fill", "none");
        fore.setAttribute("class", "fore");
        fore.setAttribute("r", r);
      } else {
        panContainer = null;
      }

      if (zoomStyle != "none") {
        zoomContainer = g.appendChild(po.svg("g"));
        zoomContainer.setAttribute("class", "zoom");

        var j = -0.5;
        if (zoomStyle == "big") {
          ticks = {};
          for (var i = map.zoomRange()[0], j = 0; i <= map.zoomRange()[1]; i++, j++) {
            (ticks[i] = zoomContainer.appendChild(tick(i))).setAttribute(
              "transform",
              "translate(0," + -(j + 0.75) * r * 0.4 + ")"
            );
          }
        }

        var p = panStyle == "none" ? 0.4 : 2;
        zoomContainer.setAttribute(
          "transform",
          "translate(0," + r * (/^top-/.test(position) ? p + (j + 0.5) * 0.4 : -p) + ")"
        );
        zoomContainer.appendChild(zoom(+1)).setAttribute("transform", "translate(0," + -(j + 0.5) * r * 0.4 + ")");
        zoomContainer.appendChild(zoom(-1)).setAttribute("transform", "scale(-1)");
      } else {
        zoomContainer = null;
      }

      move();
    }

    compass.radius = function (x) {
      if (!arguments.length) return r;
      r = x;
      if (map) draw();
      return compass;
    };

    compass.speed = function (x) {
      if (!arguments.length) return r;
      speed = x;
      return compass;
    };

    compass.position = function (x) {
      if (!arguments.length) return position;
      position = x;
      if (map) draw();
      return compass;
    };

    compass.pan = function (x) {
      if (!arguments.length) return panStyle;
      panStyle = x;
      if (map) draw();
      return compass;
    };

    compass.zoom = function (x) {
      if (!arguments.length) return zoomStyle;
      zoomStyle = x;
      if (map) draw();
      return compass;
    };

    compass.map = function (x) {
      if (!arguments.length) return map;
      if (map) {
        container.removeEventListener("mousedown", mousedown, false);
        container.removeChild(g);
        container = null;
        window.removeEventListener("mousemove", mousemove, false);
        window.removeEventListener("mouseup", mouseup, false);
        window = null;
        map.off("move", move).off("resize", move);
      }
      if ((map = x)) {
        container = map.container();
        container.appendChild(g);
        container.addEventListener("mousedown", mousedown, false);
        window = container.ownerDocument.defaultView;
        window.addEventListener("mousemove", mousemove, false);
        window.addEventListener("mouseup", mouseup, false);
        map.on("move", move).on("resize", move);
        draw();
      }
      return compass;
    };

    return compass;
  };
  po.grid = function () {
    var grid = {},
      map,
      g = po.svg("g");

    g.setAttribute("class", "grid");

    function move(e) {
      var p,
        line = g.firstChild,
        size = map.size(),
        nw = map.pointLocation(zero),
        se = map.pointLocation(size),
        step = Math.pow(2, 4 - Math.round(map.zoom()));

      // Round to step.
      nw.lat = Math.floor(nw.lat / step) * step;
      nw.lon = Math.ceil(nw.lon / step) * step;

      // Longitude ticks.
      for (var x; (x = map.locationPoint(nw).x) <= size.x; nw.lon += step) {
        if (!line) line = g.appendChild(po.svg("line"));
        line.setAttribute("x1", x);
        line.setAttribute("x2", x);
        line.setAttribute("y1", 0);
        line.setAttribute("y2", size.y);
        line = line.nextSibling;
      }

      // Latitude ticks.
      for (var y; (y = map.locationPoint(nw).y) <= size.y; nw.lat -= step) {
        if (!line) line = g.appendChild(po.svg("line"));
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.setAttribute("x1", 0);
        line.setAttribute("x2", size.x);
        line = line.nextSibling;
      }

      // Remove extra ticks.
      while (line) {
        var next = line.nextSibling;
        g.removeChild(line);
        line = next;
      }
    }

    grid.map = function (x) {
      if (!arguments.length) return map;
      if (map) {
        g.parentNode.removeChild(g);
        map.off("move", move).off("resize", move);
      }
      if ((map = x)) {
        map.on("move", move).on("resize", move);
        map.container().appendChild(g);
        map.dispatch({ type: "move" });
      }
      return grid;
    };

    return grid;
  };
  po.stylist = function () {
    var attrs = [],
      styles = [],
      title;

    function stylist(e) {
      var ne = e.features.length,
        na = attrs.length,
        ns = styles.length,
        f, // feature
        d, // data
        o, // element
        x, // attr or style or title descriptor
        v, // attr or style or title value
        i,
        j;
      for (i = 0; i < ne; ++i) {
        if (!(o = (f = e.features[i]).element)) continue;
        d = f.data;
        for (j = 0; j < na; ++j) {
          v = (x = attrs[j]).value;
          if (typeof v === "function") v = v.call(null, d);
          v == null
            ? x.name.local
              ? o.removeAttributeNS(x.name.space, x.name.local)
              : o.removeAttribute(x.name)
            : x.name.local
            ? o.setAttributeNS(x.name.space, x.name.local, v)
            : o.setAttribute(x.name, v);
        }
        for (j = 0; j < ns; ++j) {
          v = (x = styles[j]).value;
          if (typeof v === "function") v = v.call(null, d);
          v == null ? o.style.removeProperty(x.name) : o.style.setProperty(x.name, v, x.priority);
        }
        if ((v = title)) {
          if (typeof v === "function") v = v.call(null, d);
          while (o.lastChild) o.removeChild(o.lastChild);
          if (v != null) o.appendChild(po.svg("title")).appendChild(document.createTextNode(v));
        }
      }
    }

    stylist.attr = function (n, v) {
      attrs.push({ name: ns(n), value: v });
      return stylist;
    };

    stylist.style = function (n, v, p) {
      styles.push({
        name: n,
        value: v,
        priority: arguments.length < 3 ? null : p,
      });
      return stylist;
    };

    stylist.title = function (v) {
      title = v;
      return stylist;
    };

    return stylist;
  };
})(org.polymaps);
