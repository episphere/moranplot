import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';

import { addProximityHover, calcMargins, mergeOptions } from "./helper.js"
import { Result } from "./types.js"

export class MoranNetwork {
  constructor(results, options={}) {
    options = mergeOptions({
      width: 480, 
      height: 480, 
      margin: 20,
      
      fontSize: 12,
      
      colors: {
        highlight: "blue",
        highHigh: "red",
        highLow: "pink",
        lowHigh: "lightblue",
        lowLow: "blue",
        notSignificant: "grey"
      },

      xLabel: "Value (z)",
      
      pointOpacity: 0.5,
      rSmall: 2, rMedium: 3, rBig: 5,      
      drawAxisConnections: false,
      hideXAxis: false, 
    }, options)

    Object.assign(options, calcMargins(options))
    Object.assign(this, options) 

    if (!this.zExtent) {
      this.zExtent = d3.extent(results, d => d.z)
    }
    this.results = results.filter(d => Result.safeParse(d).success)
    this.lagExtent = d3.extent(results, d => d.lag)

    this.colorMap = new Map([
      ["High-high", this.colors.highHigh],
      ["High-low", this.colors.highLow],
      ["Low-high", this.colors.lowHigh],
      ["Low-low", this.colors.lowLow],
      ["Not significant", this.colors.notSignificant]
    ])
    this.resultMap = d3.index(this.results, d => d.id)
    this.plotContainer = document.createElement("div")
  }

  plot() {
    this.plotContainer.innerHTML = ''
    const quadrantLabelMargin = 6

    const quadrantLabelMarks = []
    for (const quadrant of [
      {text: "High-high", fill: this.colors.highHigh, frameAnchor: "top-right", dx: -quadrantLabelMargin, dy: quadrantLabelMargin},
      {text: "High-low", fill: this.colors.highLow, frameAnchor: "bottom-right", dx: -quadrantLabelMargin, dy: -quadrantLabelMargin},
      {text: "Low-high", fill: this.colors.lowHigh, frameAnchor: "top-left", dx: quadrantLabelMargin, dy: quadrantLabelMargin},
      {text: "Low-low", fill: this.colors.lowLow, frameAnchor: "bottom-left", dx: quadrantLabelMargin, dy: -quadrantLabelMargin},
    ]) {
      quadrantLabelMarks.push(Plot.text([quadrant.text], {
        ...quadrant, text: d => d, opacity: 0.5, fontWeight: "bold"
      }))
    }

    const marks = [
      Plot.ruleX([0], {strokeOpacity: 0.2}),
      Plot.ruleY([0], {strokeOpacity: 0.2}),
      Plot.dot(this.results, {
        x: "z", y: "lag", fill: "black", r: this.rSmall, opacity: this.pointOpacity, 
          fill: d => d.z >= this.zExtent[0] && d.z <= this.zExtent[1] ? this.colorMap.get(d.label) : "none"
      }), 
      ...quadrantLabelMarks,
      Plot.frame({strokeOpacity: 0.5}),
    ]
    
    this.moranPlot = Plot.plot({
      style: { fontSize: this.fontSize },
      width: this.width, 
      height: this.height,
      margin: 40, 
      marginBottom: this.marginBottom, marginTop: this.marginTop, marginLeft: this.marginLeft, marginRight: this.marginRight,
      x: {
        ticks: [this.zExtent[0], 0, this.zExtent[1]], domain: this.zExtent, label: this.xLabel, axis: this.hideXAxis ? null : "bottom"
      },
      y: {ticks: [this.lagExtent[0], 0, this.lagExtent[1]], domain: this.zExtent, label: "Spatial lag"},
      marks
    })

    this.plotSelect = d3.select(this.moranPlot)
    this.dotSelect = this.plotSelect.selectAll("circle")
    this.linkG = this.plotSelect.append("g").lower()
    this.axisLinkG = this.plotSelect.append("g")

    addProximityHover(this.dotSelect, this.plotSelect, (i, elem, iPrev, elemPrev) => {
      this.plotSelect.style("cursor", i != null ? "pointer" : "default")
      const result = this.results[i]
      this.#focus(result?.id, d3.select(elem), d3.select(elemPrev))
      if (this.hoverListener) this.hoverListener(this.results[i], i)
    }, 15)
    
    this.plotContainer.appendChild(this.moranPlot)
    return this.plotContainer
  }

  focus(id) {
    if (this.plotSelect) {
      this.#focus(id, this.dotSelect.filter(d => this.results[d]?.id == id)) 
    } 
  }

  onHover(listener) {
    this.hoverListener = listener
  }

  #focus(id, elemSelect) {

    if (this.prevNeighborSelect) {
      this.prevNeighborSelect
        .attr("r", this.rSmall)
        .attr("opacity", this.pointOpacity)
    }

    this.elemPrevSelect?.attr("r", this.rSmall)
    elemSelect.attr("r", this.rBig) 

    const result = this.resultMap.get(id)
    if (Result.safeParse(result).success) {
      const neighborSet = new Set(result.neighbors.map(d => d[0]))
      const neighborSelect = this.dotSelect.filter(i => neighborSet.has(this.results[i].id))
      const neighborResults = []
      neighborSelect.each(i => neighborResults.push(this.results[i]))
      this.prevNeighborSelect = neighborSelect
      neighborSelect.attr("r", this.rMedium)

      this.dotSelect.attr("opacity", .1)
      neighborSelect.attr("opacity", 1)
      elemSelect.attr("opacity", 1)

      this.prevConnect = this.#connect(this.linkG, elemSelect, neighborSelect, neighborResults)
      if (this.drawAxisConnections) {
        this.prevAxisConnect = this.#connectAxis(this.axisLinkG, elemSelect, neighborSelect)
      }
    } else {
      this.dotSelect.attr("opacity", this.pointOpacity)
      if (this.prevConnect) {
        this.prevConnect.remove()
      }
      if (this.prevAxisConnect) {
        this.prevAxisConnect.remove()
      }
    }

    this.elemPrevSelect = elemSelect
  }

  #connect(g, fromSelect, toSelect, neighborResults) {
    const fromPoint = [fromSelect.attr("cx"), fromSelect.attr("cy")]
    const toPoints = []
    toSelect.each(function() {
      var circle = d3.select(this)
      toPoints.push([+circle.attr("cx"), +circle.attr("cy")])
    })
    
    return g.selectAll("line")
      .data(toPoints)
      .join("line")
        .attr("x1", fromPoint[0])
        .attr("y1", fromPoint[1])
        .attr("x2", d => d[0])
        .attr("y2", d => d[1])
        .attr("stroke", (_,i) => this.colorMap.get(neighborResults[i]?.label))
  }

  #connectAxis(g, focusSelect, neighborSelect) {
    const points = []
    neighborSelect.each(function() {
      var circle = d3.select(this)
      points.push([+circle.attr("cx"), +circle.attr("cy")])
    })
    focusSelect.each(function() {
      var circle = d3.select(this)
      const point = [+circle.attr("cx"), +circle.attr("cy")]
      points.push(point)
      point.focus = true 
    })

    return g.selectAll("line")
      .data(points)
      .join("line")
        .attr("x1", d => d[0])
        .attr("y1", d => d[1])
        .attr("x2", d => d[0])
        .attr("y2", this.height - this.marginBottom)
        .attr("stroke", "grey")
        .attr("stroke-dasharray", d => d.focus ? "3,3" : "2,2")
        .attr("stroke-opacity", .5)
        .attr("stroke-width", d => d.focus ? 3 : 1)
        
  }
}