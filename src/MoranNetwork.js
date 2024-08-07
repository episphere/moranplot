import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';

import { addProximityHover, calcMargins, mergeOptions } from "./helper.js"
import { Result } from "./types.js"

export class MoranNetwork {
  constructor(results, options={}) {
    options = mergeOptions({
      width: 480, 
      height: 480, 
      margin: 35,
      
      fontSize: 12,
      
      colors: {
        highHigh: "#ff3d47",
        highLow: "#f99ae4",
        lowHigh: "#94d1ff",
        lowLow: "#186ffb",
        notSignificant: "#d1d1d1"
      },

      xLabel: "Value (z)",
      
      pointOpacity: 0.5, pointOpacityDimmed: 0.05,
      rSmall: 2, rMedium: 3, rBig: 5,      
      drawAxisConnections: false,
      hideXAxis: false, 
      equalAxes: true,
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
    
    this.focusId = null 
    this.selectIdSet = new Set() 
    
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

    const yConfig = this.equalAxes ? 
      {ticks: [this.zExtent[0], 0, this.zExtent[1]], domain: this.zExtent} :
      {ticks: [this.lagExtent[0], 0, this.lagExtent[1]], domain: this.lagExtent}
    
    this.moranPlot = Plot.plot({
      style: { fontSize: this.fontSize },
      width: this.width, 
      height: this.height,
      margin: this.margin, 
      marginBottom: this.marginBottom, marginTop: this.marginTop, marginLeft: this.marginLeft, marginRight: this.marginRight,
      x: {
        ticks: [this.zExtent[0], 0, this.zExtent[1]], domain: this.zExtent, label: this.xLabel, axis: this.hideXAxis ? null : "bottom"
      },
      y: {
       ...yConfig, label: "Spatial lag"
      },
      marks
    })

    this.plotSelect = d3.select(this.moranPlot)
    this.dotSelect = this.plotSelect.selectAll("circle")
      .data(this.results)
    this.linkG = this.plotSelect.append("g").lower()
    this.axisLinkG = this.plotSelect.append("g").lower()

    addProximityHover(this.dotSelect, this.plotSelect, (i, elem, iPrev, elemPrev) => {
      this.plotSelect.style("cursor", i != null ? "pointer" : "default")
      const result = this.results[i]
      this.#focus(result?.id, d3.select(elem), d3.select(elemPrev))
      if (this.hoverListener) this.hoverListener(this.results[i], i)
    }, 15)

    const cascadeAdd = (id, label) => {
      const result = this.resultMap.get(id) 
      if (result?.label == label && !this.selectIdSet.has(id)) {
        this.selectIdSet.add(id) 
        for (const [neighborId] of result.neighborWeights) {
          cascadeAdd(neighborId, label)
        }
      }
    }

    let clickCount = 0
    this.plotContainer.addEventListener("click", () => {
      clickCount++

      const clickedId = this.focusId 
      setTimeout(() => {
        if (clickCount == 1) {
          if (clickedId) {
            if (this.selectIdSet.has(clickedId)) {
              this.selectIdSet.delete(clickedId)
            } else {
              this.selectIdSet.add(clickedId)
            }
          } else {
            this.selectIdSet.clear()
            this.#draw()
          }
        } else if (clickCount == 2) {
          if (clickedId) {
            const result = this.resultMap.get(clickedId)
            cascadeAdd(clickedId, result.label)
            this.#draw()
          }
        } 
        clickCount = 0
      }, 200)
    })
    
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
    if (id == this.focusId) return 
    this.focusId = id 
    this.#draw()
  }

  #draw() {

    const neighborSet = new Set() 
    const joins = [] 
    const axisJoins = []
    const plotBottom = this.height-10
    for (const id of new Set([this.focusId, ...this.selectIdSet])) {
      if (id == null) continue

      const result = this.resultMap.get(id)
      const thisNeighborSet = new Set()
      result?.neighborWeights.forEach(([id]) => {
        neighborSet.add(id)
        thisNeighborSet.add(id)
      })


      const fromSelect = this.dotSelect.filter((_,i) => this.results[i]?.id == id)
      const toSelect = this.dotSelect.filter((_,i) => thisNeighborSet.has(this.results[i].id))
      const neighborResults = []
      toSelect.each((_,i) => neighborResults.push(this.results[i]))
      const fromPoint = [+fromSelect.attr("cx"), +fromSelect.attr("cy")]
      axisJoins.push({
        fromPoint: [+fromSelect.attr("cx"), plotBottom], 
        toPoint: [+fromSelect.attr("cx"), +fromSelect.attr("cy")]
      })
      toSelect.each(function(result) {
        var circle = d3.select(this)
        joins.push({fromPoint, toPoint: [+circle.attr("cx"), +circle.attr("cy")], label: result.label})

        axisJoins.push({
          fromPoint: [+circle.attr("cx"), plotBottom],  
          toPoint: [+circle.attr("cx"), +circle.attr("cy")]
        })
      }) 
    }

    this.dotSelect
      .attr("r", (_,i) => {
        const id = this.results[i].id
        if (this.focusId == id || this.selectIdSet.has(id)) {
          return this.rBig
        } else if (neighborSet.has(id)) {
          return this.rMedium
        } else {
          return this.rSmall
        }
      })
      .attr("opacity", (_,i) => {
        const id = this.results[i].id
        if (this.selectIdSet.size == 0 && this.focusId == null) {
          return this.pointOpacity
        } else if (this.focusId == id || this.selectIdSet.has(id) || neighborSet.has(id)) {
          return 1
        } else {
          return this.pointOpacityDimmed
        }
      })

    this.linkG.selectAll("line")
      .data(joins)
      .join("line")
        .attr("x1", d => d.fromPoint[0])
        .attr("y1", d => d.fromPoint[1])
        .attr("x2", d => d.toPoint[0])
        .attr("y2", d => d.toPoint[1])
        .attr("stroke", d => this.colorMap.get(d.label))

    if (this.drawAxisConnections) {
      this.axisLinkG.selectAll("line")
        .data(axisJoins)
        .join("line")
          .attr("x1", d => d.fromPoint[0])
          .attr("y1", d => d.fromPoint[1])
          .attr("x2", d => d.toPoint[0])
          .attr("y2", d => d.toPoint[1])
          .attr("stroke", "grey")
          .attr("opacity", .5)
          .attr("stroke-dasharray", "2,2")
    }


  }

}