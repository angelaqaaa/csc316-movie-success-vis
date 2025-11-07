class plotChart {
    constructor(_parentElement, _data) {
        this.parentElement = _parentElement;
        this.data = _data;
        this.displayData = [];
        this.selectedGenres = new Set(); // Changed to Set for multiple selections
        this.yearRange = null;
        this.isInitialized = false; // Track if charts have been initialized
        this.visibleRatingBands = new Set(['high', 'low']); // Track visible rating bands

        this.initVis();
    }

    initVis() {
        let vis = this;

        // Extract unique genres
        vis.extractGenres();
        // Setup main chart
        vis.initMainChart();

        // Setup dropdown menu
        vis.DropdownMenu = new DropdownMenu(vis.parentElement, vis.data, vis.genres, vis.selectedGenres, vis.isInitialized, vis.wrangleData.bind(vis));
        vis.DropdownMenu.initVis();

        // Initial data processing - show all movies by default
        vis.wrangleData();

        // Add window resize listener
        window.addEventListener('resize', function () {
            vis.handleResize();
        });
    }

    handleResize() {
        let vis = this;

        // Recalculate dimensions
        let container = document.getElementById("main-chart");
        if (container) {
            let containerWidth = container.getBoundingClientRect().width;
            let containerHeight = container.getBoundingClientRect().height;

            vis.width = containerWidth - vis.margin.left - vis.margin.right;
            vis.height = Math.max(containerHeight - vis.margin.top - vis.margin.bottom, 300);

            // Update SVG dimensions
            vis.svg
                .attr("width", vis.width + vis.margin.left + vis.margin.right)
                .attr("height", vis.height + vis.margin.top + vis.margin.bottom);

            // Update scales
            vis.xScale.range([0, vis.width]);
            vis.yScale.range([vis.height, 0]);

            // Update axes
            vis.xAxisGroup.attr("transform", `translate(0, ${vis.height})`);

            // Redraw
            vis.updateVis();
        }
    }

    extractGenres() {
        let vis = this;
        let genreSet = new Set();

        vis.data.forEach(d => {
            if (d.Genre) {
                d.Genre.split(',').forEach(genre => {
                    genreSet.add(genre.trim());
                });
            }
        });

        vis.genres = Array.from(genreSet).sort();

        // Initialize with all genres selected
        vis.genres.forEach(genre => vis.selectedGenres.add(genre));
    }

    initMainChart() {
        let vis = this;

        // Main chart dimensions
        vis.margin = { top: 20, right: 40, bottom: 60, left: 60 };

        // Store original scales for zoom reset
        vis.originalXDomain = null;
        vis.originalYDomain = null;
        vis.currentTransform = d3.zoomIdentity;

        // Initialize zoom behavior (will be configured after dimensions are set)
        vis.zoom = null;

        // Get the actual dimensions of the container
        let container = document.getElementById("main-chart");
        let containerWidth = container ? container.getBoundingClientRect().width : 1400;
        let containerHeight = container ? container.getBoundingClientRect().height : 500;

        // Use the full container dimensions minus margins
        vis.width = containerWidth - vis.margin.left - vis.margin.right;
        vis.height = Math.max(containerHeight - vis.margin.top - vis.margin.bottom, 300);

        // Create main SVG with zoom area
        vis.svgContainer = d3.select("#main-chart")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom);

        vis.svg = vis.svgContainer.append("g")
            .attr("transform", `translate(${vis.margin.left}, ${vis.margin.top})`);

        // Add clip path to prevent dots from showing outside chart area
        // Add extra padding at bottom to ensure dots on axis are fully visible
        vis.svg.append("defs").append("clipPath")
            .attr("id", "chart-clip")
            .append("rect")
            .attr("x", -5)  // Small padding on left
            .attr("y", -5)  // Small padding on top
            .attr("width", vis.width + 10)  // Add padding on both sides
            .attr("height", vis.height + 10);  // Extra space at bottom for dots on axis

        // Scales
        vis.xScale = d3.scaleLinear()
            .range([0, vis.width]);

        vis.yScale = d3.scaleLinear()
            .range([vis.height, 0]);

        // Color scale for IMDB ratings
        vis.colorScale = d3.scaleThreshold()
            .domain([8])  // threshold at rating 8
            .range(["#005AB5", "#ff2919ff"]);  // red for low, green for high

        // Axes
        vis.xAxis = d3.axisBottom(vis.xScale)
            .tickFormat(d3.format("d"));

        vis.yAxis = d3.axisLeft(vis.yScale)
            .tickFormat(d => `$${d / 1000000}M`);


        // Add axes FIRST so they appear behind everything
        vis.xAxisGroup = vis.svg.append("g")
            .attr("class", "axis x-axis")
            .attr("transform", `translate(0, ${vis.height})`);

        vis.yAxisGroup = vis.svg.append("g")
            .attr("class", "axis y-axis");

        // Create group for chart content AFTER axes so dots appear on top
        vis.chartArea = vis.svg.append("g")
            .attr("clip-path", "url(#chart-clip)");

        // Axis labels
        vis.svg.append("text")
            .attr("class", "axis-label")
            .attr("x", vis.width / 2)
            .attr("y", vis.height + 50)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Release Year");

        vis.svg.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -vis.height / 2)
            .attr("y", -50)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Gross Revenue");


        // Initialize zoom behavior now that dimensions are set
        vis.zoom = d3.zoom()
            .scaleExtent([0.8, 5]) // More conservative zoom range
            .translateExtent([[0, 0], [vis.width, vis.height]]) // Keep within chart bounds
            .extent([[0, 0], [vis.width, vis.height]])
            .filter(function(event) {
                // Allow zoom only with:
                // - Ctrl/Cmd + scroll (standard zoom gesture)
                // - Mouse drag (pan)
                // - Touch events
                // This prevents accidental zoom on normal scrolling
                return event.ctrlKey || event.metaKey || event.type === 'mousedown' || event.type.startsWith('touch');
            })
            .on("zoom", function(event) {
                vis.zoomed(event);
            });

        // Create a zoom area that covers the chart (add last so it's on top)
        vis.zoomArea = vis.svg.append("rect")
            .attr("class", "zoom-area")
            .attr("width", vis.width)
            .attr("height", vis.height)
            .style("fill", "none")
            .style("pointer-events", "all")
            .style("cursor", "move")
            .call(vis.zoom);

        // Double-click to reset zoom
        vis.zoomArea.on("dblclick.zoom", function() {
            vis.resetZoom();
        });

        // ===== Add Interactive Color Legend (AFTER zoom area so it's on top) =====
        // Legend position: top right of y-axis
        const legendSpacing = 28;

        const legendData = [
            { id: "high", color: "#ff2919ff", label: "High (≥8) IMDB Rating", threshold: 8 },
            { id: "low", color: "#005AB5", label: "Low (<8) IMDB Rating", threshold: 0 }
        ];

        const legend = vis.svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(80,0)`);

        // Create clickable legend items
        const legendItems = legend.selectAll(".legend-item")
            .data(legendData)
            .enter()
            .append("g")
            .attr("class", "legend-item")
            .attr("transform", (d, i) => `translate(0, ${i * legendSpacing})`)
            .style("cursor", "pointer")
            .attr("tabindex", "0") // Make keyboard accessible
            .attr("role", "button")
            .attr("aria-pressed", "true")
            .attr("aria-label", d => `Toggle ${d.label}`)
            .on("click", function(event, d) {
                vis.toggleRatingBand(d.id);
            })
            .on("keypress", function(event, d) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    vis.toggleRatingBand(d.id);
                }
            });

        legendItems.append("circle")
            .attr("class", "legend-symbol")
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("r", 6)
            .attr("fill", d => d.color)
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5);

        legendItems.append("text")
            .attr("class", "legend-label")
            .attr("x", 12)
            .attr("y", 4)
            .text(d => d.label)
            .style("fill", "#ccc");

        // Add hover effects for better discoverability
        legendItems
            .on("mouseover", function(event, d) {
                if (vis.visibleRatingBands.has(d.id)) {
                    d3.select(this).select(".legend-label")
                        .style("text-decoration", "underline")
                        .style("fill", "#fff");
                    d3.select(this).select(".legend-symbol")
                        .attr("stroke-width", 2.5);
                }
            })
            .on("mouseout", function(event, d) {
                vis.updateLegendState(); // Reset to current state
            });

        // Add reset legend button
        const resetLegendGroup = legend.append("g")
            .attr("class", "reset-legend-btn")
            .attr("transform", `translate(0, ${legendSpacing * 2 + 10})`)
            .style("cursor", "pointer")
            .attr("tabindex", "0")
            .attr("role", "button")
            .attr("aria-label", "Reset legend filters")
            .on("click", function() {
                vis.resetLegend();
            })
            .on("keypress", function(event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    vis.resetLegend();
                }
            });

        resetLegendGroup.append("text")
            .attr("x", 0)
            .attr("y", 4)
            .text("↺ Reset legend")
            .style("fill", "#888")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .on("mouseover", function() {
                d3.select(this).style("fill", "#e50914");
            })
            .on("mouseout", function() {
                d3.select(this).style("fill", "#888");
            });

        // Add reset zoom button
        const resetZoomGroup = legend.append("g")
            .attr("class", "reset-zoom-btn")
            .attr("transform", `translate(0, ${legendSpacing * 2 + 30})`)
            .style("cursor", "pointer")
            .attr("tabindex", "0")
            .attr("role", "button")
            .attr("aria-label", "Reset zoom and pan")
            .on("click", function() {
                vis.resetZoom();
            })
            .on("keypress", function(event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    vis.resetZoom();
                }
            });

        resetZoomGroup.append("text")
            .attr("x", 0)
            .attr("y", 4)
            .text("⟲ Reset view")
            .style("fill", "#888")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .on("mouseover", function() {
                d3.select(this).style("fill", "#e50914");
            })
            .on("mouseout", function() {
                d3.select(this).style("fill", "#888");
            });
    }





    // Method to handle year range updates from Timeline
    updateYearRange(yearRange) {
        let vis = this;
        vis.yearRange = yearRange;
        vis.wrangleData();
    }

    // Zoom event handler
    zoomed(event) {
        let vis = this;
        vis.currentTransform = event.transform;

        // Create new scales based on zoom transform
        const newXScale = event.transform.rescaleX(vis.xScale);
        const newYScale = event.transform.rescaleY(vis.yScale);

        // Update axes with new scales
        vis.xAxisGroup.call(vis.xAxis.scale(newXScale));
        vis.yAxisGroup.call(vis.yAxis.scale(newYScale));

        // Update dots positions with new scales
        vis.chartArea.selectAll(".dot")
            .attr("cx", d => newXScale(d.Released_Year))
            .attr("cy", d => newYScale(d.Gross));

        // Update annotations if they exist
        vis.updateAnnotationsWithZoom(newXScale, newYScale);
    }

    // Reset zoom to original view
    resetZoom() {
        let vis = this;
        vis.zoomArea.transition()
            .duration(750)
            .call(vis.zoom.transform, d3.zoomIdentity);
    }

    // Update annotations during zoom
    updateAnnotationsWithZoom(xScale, yScale) {
        let vis = this;

        // Re-position annotation lines and labels based on new scales
        vis.svg.selectAll(".annotation-line")
            .each(function(d) {
                if (d) {
                    const x = xScale(d.Released_Year);
                    const y = yScale(d.Gross);
                    d3.select(this)
                        .attr("x1", x)
                        .attr("x2", x)
                        .attr("y1", d.annotateAbove ? y - 8 : y + 8)
                        .attr("y2", d.annotateAbove ? y - 50 : y + 50);
                }
            });

        vis.svg.selectAll(".annotation-label")
            .each(function(d) {
                if (d) {
                    const x = xScale(d.Released_Year);
                    const y = yScale(d.Gross);

                    // During zoom, keep label centered on the dot's x position
                    // Only apply edge anchoring when the label would actually go off screen
                    let labelX = x;
                    const labelNode = this;
                    const bbox = labelNode.getBBox();
                    const labelWidth = bbox.width;

                    // Only adjust if label would actually go off screen
                    if (d.textAnchor === "start" && x - labelWidth/2 < 5) {
                        labelX = 5;
                        d3.select(this).style("text-anchor", "start");
                    } else if (d.textAnchor === "end" && x + labelWidth/2 > vis.width - 5) {
                        labelX = vis.width - 5;
                        d3.select(this).style("text-anchor", "end");
                    } else {
                        // Center the label on the dot
                        d3.select(this).style("text-anchor", "middle");
                    }

                    d3.select(this)
                        .attr("x", labelX)
                        .attr("y", d.annotateAbove ? y - 55 : y + 65);
                }
            });

        // Update annotation backgrounds
        vis.svg.selectAll(".annotation-group rect")
            .each(function() {
                const label = d3.select(this.parentNode).select(".annotation-label");
                if (!label.empty() && label.node()) {
                    const labelBBox = label.node().getBBox();
                    d3.select(this)
                        .attr("x", labelBBox.x - 3)
                        .attr("y", labelBBox.y - 1)
                        .attr("width", labelBBox.width + 6)
                        .attr("height", labelBBox.height + 2);
                }
            });
    }

    // Method to toggle rating band visibility
    toggleRatingBand(bandId) {
        let vis = this;

        if (vis.visibleRatingBands.has(bandId)) {
            vis.visibleRatingBands.delete(bandId);
        } else {
            vis.visibleRatingBands.add(bandId);
        }

        // Update legend visual state
        vis.updateLegendState();

        // Refresh visualization with smooth transition
        vis.wrangleData();
    }

    // Method to reset legend filters
    resetLegend() {
        let vis = this;
        vis.visibleRatingBands.clear();
        vis.visibleRatingBands.add('high');
        vis.visibleRatingBands.add('low');

        // Update legend visual state
        vis.updateLegendState();

        // Refresh visualization
        vis.wrangleData();
    }

    // Update legend visual state based on active filters
    updateLegendState() {
        let vis = this;

        vis.svg.selectAll(".legend-item")
            .each(function(d) {
                const isActive = vis.visibleRatingBands.has(d.id);

                d3.select(this)
                    .attr("aria-pressed", isActive)
                    .select(".legend-symbol")
                    .transition()
                    .duration(200)
                    .attr("fill", isActive ? d.color : "#333")
                    .attr("opacity", isActive ? 1 : 0.3);

                d3.select(this)
                    .select(".legend-label")
                    .transition()
                    .duration(200)
                    .style("fill", isActive ? "#ccc" : "#666")
                    .style("text-decoration", isActive ? "none" : "line-through");
            });
    }

    wrangleData() {
        let vis = this;

        // Filter by selected genres
        if (vis.selectedGenres.size === 0) {
            vis.displayData = [];
        } else {
            vis.displayData = vis.data.filter(d => {
                if (!d.Genre) return false;
                let movieGenres = d.Genre.split(',').map(g => g.trim());
                return movieGenres.some(genre => vis.selectedGenres.has(genre));
            });
        }

        // Filter by rating bands
        vis.displayData = vis.displayData.filter(d => {
            const rating = d.IMDB_Rating;
            if (rating >= 8 && vis.visibleRatingBands.has('high')) return true;
            if (rating < 8 && vis.visibleRatingBands.has('low')) return true;
            return false;
        });

        // Filter by year range if brush is active
        if (vis.yearRange) {
            vis.displayData = vis.displayData.filter(d =>
                d.Released_Year >= vis.yearRange[0] && d.Released_Year <= vis.yearRange[1]
            );
        }

        // Mark as initialized after first data processing
        vis.isInitialized = true;

        // Sort data by IMDB Rating so higher rated movies are drawn last (appear on top)
        vis.displayData.sort((a, b) => a.IMDB_Rating - b.IMDB_Rating);

        // Update statistics
        vis.updateStatistics();

        vis.updateVis();
    }

    updateStatistics() {
        let vis = this;

        // Update movie count
        d3.select("#movie-count").text(vis.displayData.length);

        // Calculate and update average gross
        if (vis.displayData.length > 0) {
            let avgGross = d3.mean(vis.displayData, d => d.Gross);
            d3.select("#avg-gross").text(`$${(avgGross / 1000000).toFixed(1)}M`);

            // Update year range
            let minYear = d3.min(vis.displayData, d => d.Released_Year);
            let maxYear = d3.max(vis.displayData, d => d.Released_Year);
            d3.select("#year-range").text(`${minYear}-${maxYear}`);
        } else {
            d3.select("#avg-gross").text("$0M");
            d3.select("#year-range").text("-");
        }

        // Update featured movies
        vis.updateFeaturedMovies();
    }

    updateFeaturedMovies() {
        let vis = this;

        if (vis.displayData.length === 0) {
            d3.select("#featured-movies").style("display", "none");
            return;
        }

        // Show featured movies section
        d3.select("#featured-movies").style("display", "block");

        // Find highest grossing movie
        let highestGrossing = vis.displayData.reduce((max, d) =>
            d.Gross > max.Gross ? d : max
        );

        d3.select("#highest-grossing-title").text(highestGrossing.Series_Title);
        d3.select("#highest-grossing-value").text(`$${(highestGrossing.Gross / 1000000).toFixed(1)}M (${highestGrossing.Released_Year})`);

        // Find highest rated movie
        let highestRated = vis.displayData.reduce((max, d) =>
            d.IMDB_Rating > max.IMDB_Rating ? d : max
        );

        d3.select("#highest-rated-title").text(highestRated.Series_Title);
        d3.select("#highest-rated-value").text(`${highestRated.IMDB_Rating}/10 (${highestRated.Released_Year})`);

        // Find "hidden gem" - high rating but lower gross (below median)
        let medianGross = d3.median(vis.displayData, d => d.Gross);
        let hiddenGems = vis.displayData.filter(d => d.Gross < medianGross);

        if (hiddenGems.length > 0) {
            let hiddenGem = hiddenGems.reduce((max, d) =>
                d.IMDB_Rating > max.IMDB_Rating ? d : max
            );

            d3.select("#hidden-gem-title").text(hiddenGem.Series_Title);
            d3.select("#hidden-gem-value").text(`${hiddenGem.IMDB_Rating}/10 rating, $${(hiddenGem.Gross / 1000000).toFixed(1)}M gross`);
        } else {
            d3.select("#hidden-gem-title").text("N/A");
            d3.select("#hidden-gem-value").text("Not enough data");
        }
    }

    updateVis() {
        let vis = this;

        if (vis.displayData.length === 0) {
            vis.chartArea.selectAll(".dot").remove();
            vis.svg.selectAll(".annotation-group").remove(); // Clear annotations when no data
            return;
        }

        // Update scales based on brush selection
        if (vis.yearRange) {
            // If brush is active, show only selected range
            vis.xScale.domain([
                vis.yearRange[0] - 1,
                vis.yearRange[1] + 1
            ]);
        } else {
            // Default: show entire time range
            vis.xScale.domain([
                d3.min(vis.data, d => d.Released_Year) - 2,
                d3.max(vis.data, d => d.Released_Year) + 2
            ]);
        }

        vis.yScale.domain([
            0,
            d3.max(vis.data, d => d.Gross) * 1.1
        ]);

        // Update axes
        vis.xAxisGroup.call(vis.xAxis);
        vis.yAxisGroup.call(vis.yAxis);

        // Bind data to circles (use chartArea for clipping)
        let circles = vis.chartArea.selectAll(".dot")
            .data(vis.displayData, d => d.Series_Title);

        // Exit - interrupt any ongoing transitions and fade out
        circles.exit()
            .interrupt() // Stop any ongoing transitions
            .transition("exit")
            .duration(300)
            .attr("opacity", 0)
            .remove();

        // Enter
        let enterCircles = circles.enter()
            .append("circle")
            .attr("class", "dot")
            .attr("cx", d => vis.xScale(d.Released_Year))
            .attr("cy", d => vis.yScale(d.Gross))
            .attr("r", 5)
            .attr("fill", d => vis.colorScale(d.IMDB_Rating))
            .attr("stroke", "#000")  // Add black stroke for better visibility
            .attr("stroke-width", 0.5)
            .attr("opacity", 0);

        // Merge and update - interrupt ongoing transitions before updating
        const mergedCircles = enterCircles.merge(circles);

        // Apply current zoom transform if it exists
        if (vis.currentTransform && vis.currentTransform.k !== 1) {
            const newXScale = vis.currentTransform.rescaleX(vis.xScale);
            const newYScale = vis.currentTransform.rescaleY(vis.yScale);
            mergedCircles
                .attr("cx", d => newXScale(d.Released_Year))
                .attr("cy", d => newYScale(d.Gross));
        }

        mergedCircles
            .on("mouseover", function (event, d) {
                // Build tooltip content with enhanced metadata
                let tooltipContent = `
                    <div class="tooltip-content">
                        <div class="movie-info">
                            <strong>${d.Series_Title}</strong><br/>
                            Year: ${d.Released_Year}<br/>
                            IMDB: ${d.IMDB_Rating}/10<br/>
                            Gross: $${(d.Gross / 1000000).toFixed(1)}M<br/>`;

                // Add optional fields
                if (d.Runtime && !isNaN(d.Runtime)) {
                    tooltipContent += `Runtime: ${d.Runtime} min<br/>`;
                }
                if (d.No_of_Votes && !isNaN(d.No_of_Votes)) {
                    tooltipContent += `Votes: ${d.No_of_Votes.toLocaleString()}<br/>`;
                }
                if (d.Meta_score && !isNaN(d.Meta_score)) {
                    tooltipContent += `Metascore: ${d.Meta_score}/100<br/>`;
                }

                tooltipContent += `Genre: ${d.Genre}<br/>
                            Director: ${d.Director}
                        </div>
                        <div class="movie-poster">
                            <img src="${d.Poster_Link}"
                                 alt="${d.Series_Title} Poster"
                                 onerror="this.style.display='none'"
                                 class="poster-image">
                        </div>
                    </div>`;

                // Show tooltip with content
                const tooltip = d3.select("#tooltip");
                tooltip
                    .classed("visible", true)
                    .html(tooltipContent);

                // Smart positioning to keep tooltip within viewport
                const tooltipNode = tooltip.node();
                const tooltipRect = tooltipNode.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                let left = event.pageX + 15;
                let top = event.pageY - 28;

                // Adjust horizontal position if tooltip would go off screen
                if (left + tooltipRect.width > viewportWidth) {
                    left = event.pageX - tooltipRect.width - 15;
                }

                // Adjust vertical position if tooltip would go off screen
                if (top < 0) {
                    top = event.pageY + 15;
                }
                if (top + tooltipRect.height > viewportHeight) {
                    top = viewportHeight - tooltipRect.height - 15;
                }

                tooltip
                    .style("left", left + "px")
                    .style("top", top + "px");

                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("r", 8)
                    .attr("fill", d => vis.colorScale(d.IMDB_Rating))
                    .style("stroke", "#e50914")
                    .style("stroke-width", "2px");
            })
            .on("mouseout", function () {
                d3.select("#tooltip").classed("visible", false);

                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("r", 5)
                    .attr("fill", d => vis.colorScale(d.IMDB_Rating))
                    .attr("stroke", "#000")  // Reset to black stroke
                    .attr("stroke-width", 0.5);
            })
            .interrupt() // Stop any ongoing transitions
            .transition("update")
            .duration(300)
            .attr("cx", d => {
                if (vis.currentTransform && vis.currentTransform.k !== 1) {
                    const newXScale = vis.currentTransform.rescaleX(vis.xScale);
                    return newXScale(d.Released_Year);
                }
                return vis.xScale(d.Released_Year);
            })
            .attr("cy", d => {
                if (vis.currentTransform && vis.currentTransform.k !== 1) {
                    const newYScale = vis.currentTransform.rescaleY(vis.yScale);
                    return newYScale(d.Gross);
                }
                return vis.yScale(d.Gross);
            })
            .attr("r", 5)
            .attr("fill", d => vis.colorScale(d.IMDB_Rating))
            .attr("opacity", 0.8);

        // Add annotations for insights
        vis.drawAnnotations();
    }

    drawAnnotations() {
        let vis = this;

        // Remove old annotations
        vis.svg.selectAll(".annotation-group").remove();

        if (vis.displayData.length === 0) return;

        // Create annotation group
        let annotationGroup = vis.svg.append("g")
            .attr("class", "annotation-group");

        // Find highest grossing movie
        let highestGrossing = vis.displayData.reduce((max, d) =>
            d.Gross > max.Gross ? d : max
        );

        // Add annotation for highest grossing movie
        if (highestGrossing) {
            let x = vis.xScale(highestGrossing.Released_Year);
            let y = vis.yScale(highestGrossing.Gross);

            // Determine if annotation should go above or below based on position
            let spaceAbove = y;
            let spaceBelow = vis.height - y;
            let annotateAbove = spaceAbove > 100; // Need at least 100px above to avoid covering points

            // Position annotation closer to point (8px clearance for better visual connection)
            let lineY1, lineY2, labelY;
            if (annotateAbove) {
                // Annotation above the point
                lineY1 = y - 8;   // 8px clearance from point (closer than before)
                lineY2 = y - 50;  // 42px connector line
                labelY = y - 55;  // 5px beyond line end
            } else {
                // Annotation below the point
                lineY1 = y + 8;
                lineY2 = y + 50;
                labelY = y + 65;  // More space below
            }

            // Start with full title
            let fullText = `★ ${highestGrossing.Series_Title}`;

            // Create temporary text element to measure actual width
            let tempText = annotationGroup.append("text")
                .style("font-weight", "bold")
                .style("font-size", "11px")
                .style("opacity", 0)
                .text(fullText);

            let actualWidth = tempText.node().getBBox().width;
            tempText.remove();

            // Smart truncation and positioning based on actual width
            let textAnchor = "middle";
            let labelX = x;
            let titleText = highestGrossing.Series_Title;
            let availableWidth = vis.width - 10; // Leave 5px margin on each side

            // Check if we need to truncate based on position
            if (actualWidth > availableWidth) {
                // Text too long - truncate
                let maxChars = Math.floor((availableWidth / actualWidth) * titleText.length) - 5;
                titleText = titleText.substring(0, Math.max(maxChars, 15)) + "...";
                fullText = `★ ${titleText}`;

                // Re-measure after truncation
                tempText = annotationGroup.append("text")
                    .style("font-weight", "bold")
                    .style("font-size", "11px")
                    .style("opacity", 0)
                    .text(fullText);
                actualWidth = tempText.node().getBBox().width;
                tempText.remove();
            }

            // Determine horizontal position and alignment
            if (x - actualWidth / 2 < 5) {
                // Too close to left edge - align left
                textAnchor = "start";
                labelX = 5;
            } else if (x + actualWidth / 2 > vis.width - 5) {
                // Too close to right edge - align right
                textAnchor = "end";
                labelX = vis.width - 5;
            }

            // Add connector line with data for zoom updates
            annotationGroup.append("line")
                .attr("class", "annotation-line")
                .datum({Released_Year: highestGrossing.Released_Year, Gross: highestGrossing.Gross, annotateAbove: annotateAbove})
                .attr("x1", x)
                .attr("y1", lineY1)
                .attr("x2", x)
                .attr("y2", lineY2)
                .style("stroke", "#e50914")
                .style("stroke-width", 2)
                .style("opacity", 0)
                .transition()
                .duration(500)
                .delay(400)
                .style("opacity", 0.9);

            // Add label with data for zoom updates
            annotationGroup.append("text")
                .attr("class", "annotation-label")
                .datum({Released_Year: highestGrossing.Released_Year, Gross: highestGrossing.Gross, annotateAbove: annotateAbove, textAnchor: textAnchor})
                .attr("x", labelX)
                .attr("y", labelY)
                .style("text-anchor", textAnchor)
                .style("fill", "#e50914")
                .style("font-weight", "bold")
                .style("font-size", "11px")
                .style("opacity", 0)
                .text(fullText)
                .transition()
                .duration(500)
                .delay(400)
                .style("opacity", 1);

            // Add subtle background for readability
            let labelBBox = annotationGroup.select(".annotation-label").node().getBBox();
            annotationGroup.insert("rect", ".annotation-label")
                .attr("x", labelBBox.x - 3)
                .attr("y", labelBBox.y - 1)
                .attr("width", labelBBox.width + 6)
                .attr("height", labelBBox.height + 2)
                .style("fill", "#111")
                .style("opacity", 0)
                .transition()
                .duration(500)
                .delay(400)
                .style("opacity", 0.85);
        }

        // Find highest rated movie (absolute highest, not just blockbusters)
        // This ensures sync with Featured Movies panel
        let highestRated = vis.displayData.reduce((max, d) =>
            d.IMDB_Rating > max.IMDB_Rating ? d : max
        );

        if (highestRated) {
            // Only show if different from highest grossing
            if (highestRated.Series_Title !== highestGrossing.Series_Title) {
                let x = vis.xScale(highestRated.Released_Year);
                let y = vis.yScale(highestRated.Gross);

                // Store first annotation position for collision detection
                let firstAnnotationX = vis.xScale(highestGrossing.Released_Year);
                let firstAnnotationY = vis.yScale(highestGrossing.Gross);
                let firstAnnotateAbove = firstAnnotationY > 100;

                // Determine if annotation should go above or below based on position
                let spaceAbove = y;
                let spaceBelow = vis.height - y;
                let annotateAbove = spaceAbove > 100; // Need at least 100px above

                // Check for collision with first annotation
                let xDistance = Math.abs(x - firstAnnotationX);
                let yDistance = Math.abs(y - firstAnnotationY);

                // If annotations are close together, force them to opposite sides
                if (xDistance < 150 && yDistance < 100) {
                    // Place this annotation on opposite side of the first one
                    annotateAbove = !firstAnnotateAbove;

                    // If we can't place it on opposite side (not enough space), offset horizontally
                    if ((annotateAbove && spaceAbove < 70) || (!annotateAbove && spaceBelow < 70)) {
                        annotateAbove = spaceAbove > spaceBelow;
                    }
                }

                // Position annotation closer to point (8px clearance for better visual connection)
                let lineY1, lineY2, labelY;
                if (annotateAbove) {
                    lineY1 = y - 8;   // 8px clearance from point (closer than before)
                    lineY2 = y - 50;  // 42px connector line
                    labelY = y - 55;  // 5px beyond line end
                } else {
                    lineY1 = y + 8;
                    lineY2 = y + 50;
                    labelY = y + 65;  // More space below
                }

                // Start with full title including rating
                let titleText = highestRated.Series_Title;
                let fullText = `⭐ ${titleText} (${highestRated.IMDB_Rating}/10)`;

                // Create temporary text element to measure actual width
                let tempText = annotationGroup.append("text")
                    .style("font-weight", "bold")
                    .style("font-size", "11px")
                    .style("opacity", 0)
                    .text(fullText);

                let actualWidth = tempText.node().getBBox().width;
                tempText.remove();

                // Smart truncation and positioning based on actual width
                let textAnchor = "middle";
                let labelX = x;
                let availableWidth = vis.width - 10; // Leave 5px margin on each side

                // Check if we need to truncate based on position
                if (actualWidth > availableWidth) {
                    // Text too long - truncate title part
                    let ratingPart = ` (${highestRated.IMDB_Rating}/10)`;
                    let availableForTitle = availableWidth - (ratingPart.length * 7); // Approximate rating width
                    let maxChars = Math.floor(availableForTitle / 7) - 5;
                    titleText = titleText.substring(0, Math.max(maxChars, 10)) + "...";
                    fullText = `⭐ ${titleText}${ratingPart}`;

                    // Re-measure after truncation
                    tempText = annotationGroup.append("text")
                        .style("font-weight", "bold")
                        .style("font-size", "11px")
                        .style("opacity", 0)
                        .text(fullText);
                    actualWidth = tempText.node().getBBox().width;
                    tempText.remove();
                }

                // Determine horizontal position and alignment
                if (x - actualWidth / 2 < 5) {
                    // Too close to left edge - align left
                    textAnchor = "start";
                    labelX = 5;
                } else if (x + actualWidth / 2 > vis.width - 5) {
                    // Too close to right edge - align right
                    textAnchor = "end";
                    labelX = vis.width - 5;
                }

                // Add connector line with data for zoom updates
                annotationGroup.append("line")
                    .attr("class", "annotation-line")
                    .datum({Released_Year: highestRated.Released_Year, Gross: highestRated.Gross, annotateAbove: annotateAbove})
                    .attr("x1", x)
                    .attr("y1", lineY1)
                    .attr("x2", x)
                    .attr("y2", lineY2)
                    .style("stroke", "#ff2919")
                    .style("stroke-width", 2)
                    .style("opacity", 0)
                    .transition()
                    .duration(500)
                    .delay(600)
                    .style("opacity", 0.9);

                // Add label with data for zoom updates
                annotationGroup.append("text")
                    .attr("class", "annotation-label annotation-label-2")
                    .datum({Released_Year: highestRated.Released_Year, Gross: highestRated.Gross, annotateAbove: annotateAbove, textAnchor: textAnchor})
                    .attr("x", labelX)
                    .attr("y", labelY)
                    .style("text-anchor", textAnchor)
                    .style("fill", "#ff2919")
                    .style("font-weight", "bold")
                    .style("font-size", "11px")
                    .style("opacity", 0)
                    .text(fullText)
                    .transition()
                    .duration(500)
                    .delay(600)
                    .style("opacity", 1);

                // Add background
                let labelBBox = annotationGroup.select(".annotation-label-2").node().getBBox();
                annotationGroup.insert("rect", ".annotation-label-2")
                    .attr("x", labelBBox.x - 3)
                    .attr("y", labelBBox.y - 1)
                    .attr("width", labelBBox.width + 6)
                    .attr("height", labelBBox.height + 2)
                    .style("fill", "#111")
                    .style("opacity", 0)
                    .transition()
                    .duration(500)
                    .delay(600)
                    .style("opacity", 0.85);
            }
        }
    }
}