import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';
import z from 'https://cdn.jsdelivr.net/npm/zod@3.23.5/+esm';

import { mergeOptions, getPolarAngles } from "./helper.js"
import { Result } from "./types.js"


export class LagRadial {
  constructor(results, options) {
    options = mergeOptions({
      featureCentroids: undefined, 
      neighborAngles: undefined,
    
      size: 180,
      margin: 5,

      fontSize: 12,
      
      innerRadius: 15, 
      pointRadius: [2,5],
      
      colors: {
        axis: "#ededed",
        refCircle: "#d1d1d1",
        connection: "blue",
        positiveAutocorrelation: "green",
        negativeAutocorrelation: "purple",
        highHigh: "red",
        highLow: "pink",
        lowHigh: "lightblue",
        lowLow: "blue",
        notSignificant: "grey",
        font: "#414848",
      },
    }, options)
    Object.assign(this, options)

    this.results = results.filter(d => Result.safeParse(d).success)
    this.resultMap = d3.index(this.results, d => d.id)
    if (!this.zExtent) {
      this.zExtent = d3.extent(results, d => d.z)
    }

    if (Number.isFinite(this.pointRadius)) {
      this.pointRadius = [this.pointRadius, this.pointRadius]
    }

    this.colorMap = new Map([
      ["High-high", this.colors.highHigh],
      ["High-low", this.colors.highLow],
      ["Low-high", this.colors.lowHigh],
      ["Low-low", this.colors.lowLow],
      ["Not significant", this.colors.notSignificant]
    ])
      
    this.rScale = d3.scaleLinear() 
      .domain(this.zExtent)
      .range([this.innerRadius, this.size/2 - this.margin])

    this.yScale = d3.scaleLinear() 
      .domain([...this.zExtent].reverse()) 
      .range([this.margin, this.size/2 - this.innerRadius])

    if (this.neighborAngles) {
      const angleIndex = d3.index(this.neighborAngles, d => d.from, d => d.to)
      this.angleMap = new Map()
      for (const result of this.results) {
        const angles = result.neighborWeights.map(([id]) => {
          const angle = angleIndex.get(result.id)?.get(id)
          if (!Number.isFinite(angle.angle)) {
            throw new Error(`neighborAngles specified in arguments, but missing angle from ${result.id} to ${id}`)
          }
          return [id, angle.angle]
        })
        this.angleMap.set(result.id, angles)        
      }
    } else if (this.featureCentroids) {

      const centroidMap = new Map(this.featureCentroids.map(d => [d.id, d.centroid]))

      // Check input
      const NumberPair = z.tuple([z.number(), z.number()])
      for (const result of this.results) {
        const centroid = centroidMap.get(result.id)
        if (!NumberPair.safeParse(centroid).success) {
          throw new Error(`featureCentroids specified in arguments, but centroid for ID ${result.id} is missing or is in an invalid format (must be a pair of numbers)`)
        }
      }

      this.angleMap = new Map()
      for (const result of this.results) {
        const centroid = centroidMap.get(result.id)
        const neighborCentroids = result.neighborWeights.map(([id]) => centroidMap.get(id))
        const neighborAngles = getPolarAngles(centroid, neighborCentroids)

        
        const angles = neighborAngles.map((d,i) => [result.neighborWeights[i][0], d])
        this.angleMap.set(result.id, angles)
      }

    } else {
      this.angleMap = new Map()

      for (const result of results) {
        if (result.neighborWeights) {
          const resultAngles = []
          this.angleMap.set(result.id, resultAngles)
          const angleStep = 2*Math.PI / result.neighborWeights.length
          result.neighborWeights.forEach(([id], i) => {
            resultAngles.push([id, angleStep*i])
          })
        }

      }
    }

    // Zero centered color scale  TODO: Add ability to customize scheme
    const max = d3.max(this.zExtent, Math.abs)
    this.colorScale = d3.scaleSequential()
     .domain([max, -max])
     .interpolator(d3.interpolateRdYlBu); 

    this.#createSvg()

    this.plotContainer = document.createElement("div")
    this.plotContainer.style.display = "flex"
    this.plotContainer.style.alignItems = "center"
    this.plotContainer.appendChild(this.svg.node())
  }

  plot() {
    return this.plotContainer
  }

  focus(id) {
    this.#focus(id) 
  }

  #focus(id) {
    if (id) {
      const result = this.resultMap.get(id)
      let neighborResults = result.neighborWeights.map(d => this.resultMap.get(d[0]))
      const neighborAngles = this.angleMap.get(id)


      const pointRadiusScale = d3.scaleLinear()
        .domain(d3.extent(result.neighborWeights, d => d[1]))
        .range(this.pointRadius)

      const innerPoints = neighborAngles.map(([_,angle]) => d3.pointRadial(angle, this.innerRadius))
      const outerPoints = neighborAngles.map(([_,angle]) => d3.pointRadial(angle, this.rScale.range()[1]))

      this.gAxisCircle.selectAll("line")
        .data(outerPoints)
        .join("line")
          .attr("x1", (_,i) => innerPoints[i][0])
          .attr("y1", (_,i) => innerPoints[i][1])
          .attr("x2", d => d[0])
          .attr("y2", d => d[1])

      this.lagCircle
        .attr("r", d => this.rScale(result.lag))

      let neighborPoints = neighborAngles
        .map(([_,angle],i) => d3.pointRadial(angle, this.rScale(neighborResults[i]?.z)))
      let lagPoints = neighborAngles
        .map(([_,angle],i) => d3.pointRadial(angle, this.rScale(result.lag)))
      neighborPoints.forEach((d,i) => {
        d.i = i
        d.w = result.neighborWeights[i][1]
        d.z = neighborResults[i]?.z
        d.label = neighborResults[i]?.label
      })

      const NumberPair = z.tuple([z.number(), z.number()])
      neighborPoints = neighborPoints.filter(d => NumberPair.safeParse(d).success)

      this.gPoints.selectAll("circle")
        .data(neighborPoints)
        .join("circle")
          .attr("cx", d => d[0])
          .attr("cy", d => d[1])
          .attr("r", (d,i) => pointRadiusScale(d.w))
          //.attr("fill", d => this.colorMap.get(d.label))
          .attr("fill", d => this.colorScale(d.z))
          .attr("stroke", "grey")

      this.gLines.selectAll("line")
        .data(neighborPoints)
        .join("line")
          .attr("x1", d => lagPoints[d.i][0])
          .attr("y1", d => lagPoints[d.i][1])
          .attr("x2", d => d[0])
          .attr("y2", d => d[1])

      this.lagAxisDot
        .attr("cy", this.yScale(result.lag))

      const lagCutoffs = [result.lowerCutoff, result.upperCutoff].map(d => d / result.z).sort((a,b) => a-b)
      this.upperCutoffAxis
        .attr("y", this.yScale(this.zExtent[1]))
        .attr("width", 5)
        .attr("height", this.yScale(lagCutoffs[1])-this.yScale(this.zExtent[1]))
        .attr("fill", result.z > 0 ? this.colors.positiveAutocorrelation : this.colors.negativeAutocorrelation)
      this.lowerCutoffAxis
        .attr("y", this.yScale(lagCutoffs[0]))
        .attr("width", 5)
        .attr("height", this.yScale(this.zExtent[0])-this.yScale(lagCutoffs[0]))
        .attr("fill", result.z > 0 ? this.colors.negativeAutocorrelation : this.colors.positiveAutocorrelation)

      this.axisLagJoin
        .attr("y1", this.yScale(result.lag))
        .attr("y2", this.yScale(result.lag))
    }
  }

  #createSvg() {
    this.svg = d3.create("svg")
      .attr("width", this.size + 30)
      .attr("height", this.size)

    this.radial = this.svg.append("g")
      .attr("transform", `translate(${this.size/2}, ${this.size/2})`)

    // Axis circles
    this.gAxisCircle =  this.radial.append("g")
      .attr("stroke", this.colors.axis)
      .attr("fill", "none")
    this.gAxisCircle.selectAll("circle")
      .data([ 0,  this.zExtent[1]])
      .join("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", d => this.rScale(d))
        .attr("stroke", this.colors.refCircle)
    this.gAxisCircle.append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", d => this.rScale(this.zExtent[0]))
      .attr("fill", this.colors.refCircle)

    // Points and connecting lines
    this.gLines = this.radial.append("g")
      .attr("stroke", "black")
      .attr("opacity", .75)
    this.gPoints = this.radial.append("g")
      .attr("fill", this.colors.connection)

    this.lagCircle = this.radial.append("circle")
      .attr("stroke", this.colors.connection)
      .attr("fill", "none")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("stroke-opacity", 1)
      .attr("stroke-dasharray", "2,3")

    // Vertical axis
    const gAxis = this.svg.append("g")
      .attr("transform", `translate(${this.size},0)`)
      .attr("opacity", 1) 
      .style("font-size", this.fontSize + "px")
    gAxis.call(d3.axisRight(this.yScale)
      .tickValues([this.zExtent[1], 0, this.zExtent[0]])
      .tickSize(5))
    gAxis.selectAll("line")
      .attr("stroke", this.colors.refCircle)
    gAxis.selectAll("path")
      .attr("stroke", this.colors.refCircle)
    gAxis.selectAll("text")
      .attr("fill", this.colors.font)

    // Stuff on vertical axis
    this.gAxisContent = this.svg.append("g")
      .attr("transform", `translate(${this.size}, 0)`)
    this.lowerCutoffAxis = this.gAxisContent.append("rect")
      .attr("opacity", .3)
    this.upperCutoffAxis = this.gAxisContent.append("rect")
      .attr("opacity", .3)
    
    this.lagAxisDot = this.gAxisContent.append("circle")
      .attr("fill", "orange")
      .attr("r", 2)

    this.axisLagJoin = this.svg.append("line")
      .attr("stroke", this.colors.connection)
      .attr("stroke-dasharray", "1,2")
      .attr("x1", this.size/2)
      .attr("x2", this.size)

  }
}