// Popper
import * as Popper from 'https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';
import gaussian from 'https://cdn.jsdelivr.net/npm/gaussian@1.3.0/+esm'

export function addPopperTooltip(element) {

  const tooltipElement = document.createElement("div")
  tooltipElement.classList.add("custom-tooltip")
  element.appendChild(tooltipElement)

  let popper = null
  function show(targetElement, html) {
    if (popper) popper.destroy()
    popper = Popper.createPopper(targetElement, tooltipElement, {
      placement: "top-start",
      modifiers: [
        {
          name: 'offset',
          options: {
            offset: [10, 10],
          },
        },
        {
          name: 'preventOverflow',
          options: {
            boundary: element,
          },
        },
      ],
    })

    if (html instanceof Element) {
      tooltipElement.innerHTML = ``
      tooltipElement.appendChild(html)
    } else {
      tooltipElement.innerHTML = html
    }

    tooltipElement.style.display = "block"
  }

  function hide() {
    tooltipElement.style.display = "none"
  }

  return { show, hide }
}

export function addProximityHover(elementsSelect, plotSelect, listener, minDistance=30) {
  let delauney = null 
  let points = []
  const observer = new ResizeObserver(() => {
    const plotRect = plotSelect.node().getBoundingClientRect()
    points = []
    elementsSelect.each((_,i,nodes) => {
      const elemRect = nodes[i].getBoundingClientRect()
      const centroid = [elemRect.x + elemRect.width/2, elemRect.y+elemRect.height/2]
      const relCentroid = [centroid[0]-plotRect.x, centroid[1]-plotRect.y]
      points.push(relCentroid)
    })
    delauney = d3.Delaunay.from(points, d => d[0], d => d[1])
  })
  observer.observe(plotSelect.node())
  
  const distSqr = minDistance**2

  let previousHover = null

  plotSelect.on("mousemove", (e,d) => {
    // To account for elements rescaled by CSS
    const domPoint = new DOMPointReadOnly(e.clientX, e.clientY)
    const pt = domPoint.matrixTransform(plotSelect.node().getScreenCTM().inverse())
    const mousePoint = [pt.x, pt.y]

    const pointIndex = delauney.find(mousePoint[0], mousePoint[1])
    const point = points[pointIndex] 

    if (minDistance != null) {
      const distance = (mousePoint[0]-point[0])**2 + (mousePoint[1]-point[1])**2

      let newHover = distance < distSqr ? pointIndex : null 
      if (newHover != previousHover) {
        listener(newHover, elementsSelect.nodes()[newHover], previousHover, elementsSelect.nodes()[previousHover])
        previousHover = newHover
      } 
    }
  })
}

export function calcMargins(options) {
  return mergeOptions({
    marginLeft: options.margin,
    marginRight: options.margin,
    marginTop: options.margin,
    marginBottom: options.margin,
  }, options)
}

export function getPolarAngles(center, points) {
  const angles = [];
  for (let point of points) {
    if (point != null && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
      const dx = point[0] - center[0]
      const dy = point[1] - center[1]
      let angle = Math.atan2(dy, dx)
      angles.push(angle)
    } else {
      angles.push(null)
    }
  }
  return angles.map(d => d + Math.PI/2)
}

export function mergeOptions(defaultOptions, userOptions={}) {
  if (userOptions == null) {
    return defaultOptions
  }

  if (defaultOptions == null) {
    return userOptions
  }
  
  for (const [property, userValue] of Object.entries(userOptions)) {
    const defaultValue = defaultOptions[property]
    if (typeof userValue == "object" && typeof defaultValue == "object") {
      defaultOptions[property] = mergeOptions(defaultValue, userValue)
    } else if (defaultOptions.hasOwnProperty(property)) {
      defaultOptions[property] = userValue 
    } else {
      defaultOptions[property] = userValue 
    }
  }
  return defaultOptions
}

export function kde(X, K, h) {
  return function (x) {
    let sum = 0 
    for (let xi of X) {
      sum += K((x - xi) / h)
    }
    return (1/(X.length*h)) * sum
  }
}

export function estimateDistribution(X, n=50, extent=null) {  
  const normal = gaussian(0,1)
  const h = 0.9 * d3.deviation(X) * X.length ** (-1/5)
  const kernel = kde(X, d => normal.pdf(d), h)

  if (!extent) {
    extent = d3.extent(X)
  }

  const threshold = 0.001

  let points = []
  let step = (extent[1] - extent[0])/n
  for (let i = 0; i < n; i++) {
    const x = extent[0] - step*i 
    const value = kernel(x) 
    points.push([x,value])
    if (value < threshold) {
      break 
    }
  }
  points = points.reverse()
  for (let i = 1; i < n*2; i++) {
    const x = extent[0] + step*i 
    const value = kernel(x) 
    points.push([x,value])
    if (value < threshold) {
      break 
    }
  }

  
  const max = d3.max(points, d => d[1])
  return points.map(([x,y]) => [x, y])
}

export function interpolatePoints(points, xVals) {
  const resultPoints = [...points]

  for (const x of xVals) {
    let i = 1
    while (i < points.length && points[i][0] < x) {
      i++
    }


    if (i === 0 || i === points.length) {
      resultPoints.push([x, NaN])
      continue
    }

    const x0 = points[i - 1][0]
    const y0 = points[i - 1][1]
    const x1 = points[i][0]
    const y1 = points[i][1]

    const y = y0 + (x - x0) * (y1 - y0) / (x1 - x0)

    resultPoints.push([x, y])
  }

  return resultPoints.sort((a,b) => a[0] - b[0])
}