class plotChart {
    constructor(_parentElement, _data) {
        this.parentElement = _parentElement;
        this.data = _data;
        this.displayData = [];
        this.selectedGenres = new Set();
        this.yearRange = null;
        this.ratingSplit = 8.0; // Threshold to split High (≥ t) vs Low (< t)
        this.ratingExtent = [0, 10]; // Min/max ratings in dataset (computed on init)
        this.isInitialized = false; // Track if charts have been initialized
        this.visibleRatingBands = new Set(['high', 'low']); // Track visible rating bands

        // Track active dot for keyboard navigation (roving tabindex pattern)
        this.activeDotIndex = null; // Index of currently focused dot
        this.isContainerFocused = false; // Track if container has focus
        this.isHoveringDot = false; // Track if currently hovering over any dot

        this.initVis();
    }

    initVis() {
        let vis = this;

        // Compute rating extent from data
        vis.ratingExtent = d3.extent(vis.data, d => d.IMDB_Rating);
        // Round outward to nearest 0.1
        vis.ratingExtent[0] = Math.floor(vis.ratingExtent[0] * 10) / 10;
        vis.ratingExtent[1] = Math.ceil(vis.ratingExtent[1] * 10) / 10;

        // Clamp default threshold to data extent
        vis.ratingSplit = Math.max(vis.ratingExtent[0], Math.min(vis.ratingSplit, vis.ratingExtent[1]));

        vis.extractGenres();
        vis.initMainChart();

        vis.DropdownMenu = new DropdownMenu(vis.parentElement, vis.data, vis.genres, vis.selectedGenres, vis.isInitialized, vis.wrangleData.bind(vis));
        vis.DropdownMenu.initVis();

        // Track reset view button state
        vis.resetViewVisible = false;

        vis.wrangleData();

        window.addEventListener('resize', function () {
            vis.handleResize();
        });
    }

    handleResize() {
        let vis = this;

        let container = document.getElementById("main-chart");
        if (container) {
            let containerWidth = container.getBoundingClientRect().width;
            let containerHeight = container.getBoundingClientRect().height;

            vis.width = containerWidth - vis.margin.left - vis.margin.right;
            vis.height = Math.max(containerHeight - vis.margin.top - vis.margin.bottom, 300);

            vis.svg
                .attr("width", vis.width + vis.margin.left + vis.margin.right)
                .attr("height", vis.height + vis.margin.top + vis.margin.bottom);

            vis.xScale.range([0, vis.width]);
            vis.xAxisGroup.attr("transform", `translate(0, ${vis.height})`);

            // Update clip-path dimensions (maintain 7px bottom padding)
            vis.svg.select("#chart-clip rect")
                .attr("width", vis.width)
                .attr("height", vis.height + 7);

            // Update zoom extents
            if (vis.zoom) {
                vis.zoom
                    .translateExtent([[0, 0], [vis.width, vis.height]])
                    .extent([[0, 0], [vis.width, vis.height]]);
            }

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

        // Define color palette (color-blind friendly)
        vis.highColor = "#ff2919ff"; // Red for high ratings
        vis.lowColor = "#005AB5";    // Blue for low ratings

        vis.margin = { top: 10, right: 30, bottom: 60, left: 70 };

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

        vis.width = containerWidth - vis.margin.left - vis.margin.right;
        vis.height = Math.max(containerHeight - vis.margin.top - vis.margin.bottom, 390);

        // Create main SVG with zoom area
        vis.svgContainer = d3.select("#main-chart")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            .attr("tabindex", "0") // Make focusable for keyboard navigation (roving tabindex)
            .attr("role", "application") // Indicate this handles its own keyboard navigation
            .attr("aria-label", "Scatter plot of movie gross revenue. Use arrow keys to navigate between movies.");

        vis.svg = vis.svgContainer.append("g")
            .attr("transform", `translate(${vis.margin.left}, ${vis.margin.top})`);

        // Add clip path to prevent dots from showing outside chart area
        // Add padding at bottom so dots on x-axis are fully visible (radius 5 + stroke)
        vis.svg.append("defs").append("clipPath")
            .attr("id", "chart-clip")
            .append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", vis.width)
            .attr("height", vis.height + 7)  // Extra 7px at bottom for full dot visibility

        // Scales
        vis.xScale = d3.scaleLinear()
            .range([0, vis.width]);

        vis.yScale = d3.scaleLinear();
            // Removed .clamp(true) - it was causing dots to stick at boundaries during zoom/pan



        // Color scale based on dynamic rating threshold
        vis.colorScale = d3.scaleThreshold()
            .domain([vis.ratingSplit])
            .range([vis.lowColor, vis.highColor]);

        vis.xAxis = d3.axisBottom(vis.xScale)
            .tickFormat(d3.format("d"));

        vis.yAxis = d3.axisLeft(vis.yScale)
            .tickFormat(d => `$${d / 1000000}M`)
            .tickSizeOuter(0)
            .tickSizeInner(6)
            .tickPadding(8);


        // Add axes FIRST so they appear behind everything
        vis.xAxisGroup = vis.svg.append("g")
            .attr("class", "axis x-axis")
            .attr("transform", `translate(0, ${vis.height})`);

        vis.yAxisGroup = vis.svg.append("g")
            .attr("class", "axis y-axis");

        // Create group for chart content AFTER axes so dots appear on top
        vis.chartArea = vis.svg.append("g")
            .attr("clip-path", "url(#chart-clip)");

        // Add mouseleave handler to clear timeline pulse when mouse exits scatter area
        // Dot highlights are cleared by the grace timer in mouseout handler
        vis.chartArea.on("mouseleave", function() {
            if (vis.timeline) {
                vis.timeline.highlightYearOnTimeline(null);
            }
        });

        // Add keyboard navigation (roving tabindex pattern)
        vis.svgContainer.on("keydown", function(event) {
            vis.handleKeyboardNavigation(event);
        });

        // Track focus state
        vis.svgContainer.on("focus", function() {
            vis.isContainerFocused = true;
        });

        // Clear active dot when container loses focus
        vis.svgContainer.on("blur", function() {
            vis.isContainerFocused = false;
            if (vis.activeDotIndex !== null) {
                // Remove active styling and reset appearance to normal
                vis.chartArea.selectAll(".dot")
                    .classed("is-active", false)
                    .classed("is-highlighted", false)
                    .classed("is-dimmed", false)
                    .attr("r", 5)
                    .style("stroke", "#ffffff")
                    .style("stroke-width", "1px");

                vis.activeDotIndex = null;
                // Clear timeline pulse
                if (vis.timeline) {
                    vis.timeline.highlightYearOnTimeline(null);
                }
            }
        });

        // Axis labels
        vis.svg.append("text")
            .attr("class", "axis-label")
            .attr("x", vis.width / 2)
            .attr("y", vis.height + 35)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Release Year");

        vis.svg.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -vis.height / 2)
            .attr("y", -60)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Gross Revenue");


        // Initialize zoom behavior now that dimensions are set
        vis.zoom = d3.zoom()
            .scaleExtent([1, 20]) // Allow zoom from 1x to 20x
            .translateExtent([[0, 0], [vis.width, vis.height]]) // Constrain panning to chart boundaries
            .extent([[0, 0], [vis.width, vis.height]]) // Set the viewport extent
            .filter(function(event) {
                // Exclude events from rating sliders or legend interactive elements
                const target = event.target;
                if (target.tagName === 'INPUT' ||
                    target.closest('.rating-slider-legend') ||
                    target.closest('foreignObject')) {
                    return false;
                }

                // For wheel events, only allow with Ctrl/Cmd key to prevent accidental zoom
                if (event.type === 'wheel') {
                    return event.ctrlKey || event.metaKey;
                }
                // Allow all other events (drag for pan, touch, etc.)
                return true;
            })
            .on("zoom", function(event) {
                vis.zoomed(event);
            });

        // Apply zoom to the SVG container (not the group) to capture all events
        vis.svgContainer.call(vis.zoom);

        // Override double-click behavior to reset zoom instead of default zoom-in
        vis.svgContainer.on("dblclick.zoom", null); // Remove default D3 double-click zoom
        vis.svgContainer.on("dblclick", function() {
            vis.resetZoom();
        });

        // ===== Add Interactive Color Legend (AFTER zoom area so it's on top) =====
        // Legend position: top right of y-axis
        const legendSpacing = 28;

        const legendData = [
            { id: "high", color: "#ff2919ff", label: `High (≥${vis.ratingSplit.toFixed(1)})`, threshold: vis.ratingSplit },
            { id: "low", color: "#005AB5", label: `Low (<${vis.ratingSplit.toFixed(1)})`, threshold: 0 }
        ];

        const legend = vis.svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(40,25)`);

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
                this.blur(); // Remove focus after click
                vis.toggleRatingBand(d.id);
            })
            .on("keydown", function(event, d) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.blur(); // Remove focus after keypress
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

        // Add count text for each legend item (positioned after label)
        legendItems.append("text")
            .attr("class", "legend-count")
            .attr("x", 12)
            .attr("y", 4)
            .text(" · 0")
            .style("fill", "#888")
            .style("font-size", "11px");

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

        // Add reset legend button - aligned with legend items
        const resetLegendGroup = legend.append("g")
            .attr("class", "reset-legend-btn")
            .attr("transform", `translate(0, ${legendSpacing * 2})`)
            .style("cursor", "pointer")
            .attr("tabindex", "0")
            .attr("role", "button")
            .attr("aria-label", "Reset legend filters")
            .on("click", function() {
                this.blur(); // Remove focus after click
                vis.resetLegend();
            })
            .on("keydown", function(event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.blur(); // Remove focus after keypress
                    vis.resetLegend();
                }
            });

        // Add symbol aligned with legend circles (at x=0)
        resetLegendGroup.append("text")
            .attr("x", 0)
            .attr("y", 4)
            .text("↺")
            .style("fill", "#888")
            .style("font-size", "12px")
            .style("font-weight", "500")
            .style("text-anchor", "middle")
            .on("mouseover", function() {
                d3.select(this).style("fill", "#e50914");
                d3.select(this.parentNode).select(".reset-label").style("fill", "#e50914");
            })
            .on("mouseout", function() {
                d3.select(this).style("fill", "#888");
                d3.select(this.parentNode).select(".reset-label").style("fill", "#888");
            });

        // Add text aligned with legend text (at x=12)
        resetLegendGroup.append("text")
            .attr("class", "reset-label")
            .attr("x", 12)
            .attr("y", 4)
            .text("Reset legend")
            .style("fill", "#888")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .on("mouseover", function() {
                d3.select(this).style("fill", "#e50914");
                d3.select(this.parentNode).select("text").style("fill", "#e50914");
            })
            .on("mouseout", function() {
                d3.select(this).style("fill", "#888");
                d3.select(this.parentNode).selectAll("text").style("fill", "#888");
            });

        // ===== Add Rating Split Threshold Control =====
        const thresholdY = legendSpacing * 3 + 5;

        // Add divider line
        legend.append("line")
            .attr("class", "legend-divider")
            .attr("x1", -10)
            .attr("x2", 150)
            .attr("y1", thresholdY - 15)
            .attr("y2", thresholdY - 15)
            .style("stroke", "#444")
            .style("stroke-width", 1);

        // Threshold label
        legend.append("text")
            .attr("class", "threshold-label")
            .attr("x", -5)
            .attr("y", thresholdY + 5)
            .text("Rating split")
            .style("fill", "#aaa")
            .style("font-size", "11px")
            .style("font-weight", "500");

        // Live threshold display
        legend.append("text")
            .attr("id", "threshold-display")
            .attr("x", -5)
            .attr("y", thresholdY + 21)
            .text(vis.ratingSplit.toFixed(1))
            .style("fill", "#e50914")
            .style("font-size", "11px")
            .style("font-weight", "600");

        // Threshold slider
        const sliderY = thresholdY + 35;
        const sliderFO = legend.append("foreignObject")
            .attr("x", -5)
            .attr("y", sliderY - 18)
            .attr("width", 150)
            .attr("height", 25)
            .style("pointer-events", "all");

        sliderFO.append("xhtml:input")
            .attr("type", "range")
            .attr("id", "rating-threshold-slider")
            .attr("class", "rating-threshold-slider")
            .attr("min", vis.ratingExtent[0] - 0.1)
            .attr("max", vis.ratingExtent[1] + 0.1)
            .attr("step", 0.1)
            .attr("value", vis.ratingSplit)
            .attr("aria-label", "Rating split threshold")
            .attr("aria-valuemin", vis.ratingExtent[0] - 0.1)
            .attr("aria-valuemax", vis.ratingExtent[1] + 0.1)
            .attr("aria-valuenow", vis.ratingSplit)
            .attr("aria-valuetext", `High if rating ≥ ${vis.ratingSplit.toFixed(1)}, Low otherwise`)
            .style("width", "100%")
            .style("pointer-events", "all");

        // Add reset zoom button (initially hidden) - positioned after threshold slider
        const resetViewY = sliderY + 30; // Position after slider with spacing
        const resetZoomGroup = legend.append("g")
            .attr("class", "reset-zoom-btn")
            .attr("transform", `translate(0, ${resetViewY - 6})`)
            .style("cursor", "pointer")
            .style("opacity", 0)  // Start invisible
            .style("pointer-events", "none")  // Disable clicks when invisible
            .attr("tabindex", "-1")  // Start not tabbable (hidden)
            .attr("role", "button")
            .attr("aria-label", "Reset zoom and pan")
            .on("click", function() {
                this.blur(); // Remove focus to prevent visible focus effect after button fades out
                vis.resetZoom();
            })
            .on("keydown", function(event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.blur(); // Remove focus to prevent visible focus effect after button fades out
                    vis.resetZoom();
                }
            });

        // Add symbol aligned with legend circles (at x=0)
        resetZoomGroup.append("text")
            .attr("x", 0)
            .attr("y", 4)
            .text("↺")
            .style("fill", "#888")
            .style("font-size", "12px")
            .style("font-weight", "500")
            .style("text-anchor", "middle")
            .on("mouseover", function() {
                d3.select(this).style("fill", "#e50914");
                d3.select(this.parentNode).select(".reset-label").style("fill", "#e50914");
            })
            .on("mouseout", function() {
                d3.select(this).style("fill", "#888");
                d3.select(this.parentNode).select(".reset-label").style("fill", "#888");
            });

        // Add text aligned with legend text (at x=12)
        resetZoomGroup.append("text")
            .attr("class", "reset-label")
            .attr("x", 12)
            .attr("y", 4)
            .text("Reset view")
            .style("fill", "#888")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .on("mouseover", function() {
                d3.select(this).style("fill", "#e50914");
                d3.select(this.parentNode).select("text").style("fill", "#e50914");
            })
            .on("mouseout", function() {
                d3.select(this).style("fill", "#888");
                d3.select(this.parentNode).selectAll("text").style("fill", "#888");
            });

        // Store legend reference for later updates
        vis.legend = legend;
        vis.legendPadding = { top: 15, right: 18, bottom: 15, left: 15 };

        // Add drop shadow filter (only once)
        const defs = vis.svg.select("defs").empty()
            ? vis.svg.append("defs")
            : vis.svg.select("defs");

        const filter = defs.append("filter")
            .attr("id", "legend-shadow")
            .attr("x", "-50%")
            .attr("y", "-50%")
            .attr("width", "200%")
            .attr("height", "200%");

        filter.append("feGaussianBlur")
            .attr("in", "SourceAlpha")
            .attr("stdDeviation", 4);

        filter.append("feOffset")
            .attr("dx", 0)
            .attr("dy", 2)
            .attr("result", "offsetblur");

        filter.append("feComponentTransfer")
            .append("feFuncA")
            .attr("type", "linear")
            .attr("slope", 0.3);

        const feMerge = filter.append("feMerge");
        feMerge.append("feMergeNode");
        feMerge.append("feMergeNode")
            .attr("in", "SourceGraphic");

        // Create background group and initial background
        const bgGroup = legend.insert("g", ":first-child")
            .attr("class", "legend-bg-group");

        bgGroup.append("rect")
            .attr("class", "legend-background");

        bgGroup.append("rect")
            .attr("class", "legend-inner-border");

        // Initial background update
        vis.updateLegendBackground();
    }

    // Update legend background size dynamically
    updateLegendBackground() {
        let vis = this;

        // Temporarily hide background elements to get accurate content bbox
        const bgGroup = vis.legend.select(".legend-bg-group");
        const wasVisible = bgGroup.style("display") !== "none";
        bgGroup.style("display", "none");

        // Also temporarily hide reset view button if it's not visible
        const resetViewBtn = vis.legend.select(".reset-zoom-btn");
        const resetViewWasVisible = resetViewBtn.style("display") !== "none";
        if (!vis.resetViewVisible) {
            resetViewBtn.style("display", "none");
        }

        // Get bbox of content only (excluding background and hidden button)
        const legendBBox = vis.legend.node().getBBox();

        // Restore background visibility
        if (wasVisible) {
            bgGroup.style("display", null);
        }

        // Restore reset view button visibility
        if (!vis.resetViewVisible && resetViewWasVisible) {
            resetViewBtn.style("display", null);
        }

        const padding = vis.legendPadding;

        // Update background rectangle with smooth transition
        vis.legend.select(".legend-background")
            .transition()
            .duration(300)
            .attr("x", legendBBox.x - padding.left)
            .attr("y", legendBBox.y - padding.top)
            .attr("width", legendBBox.width + padding.left + padding.right)
            .attr("height", legendBBox.height + padding.top + padding.bottom)
            .attr("rx", 8)
            .attr("ry", 8)
            .style("fill", "rgba(0, 0, 0, 0.85)")
            .style("stroke", "rgba(255, 255, 255, 0.1)")
            .style("stroke-width", 1.5)
            .style("filter", "url(#legend-shadow)");

        // Update inner border
        vis.legend.select(".legend-inner-border")
            .transition()
            .duration(300)
            .attr("x", legendBBox.x - padding.left + 1)
            .attr("y", legendBBox.y - padding.top + 1)
            .attr("width", legendBBox.width + padding.left + padding.right - 2)
            .attr("height", legendBBox.height + padding.top + padding.bottom - 2)
            .attr("rx", 7)
            .attr("ry", 7)
            .style("fill", "none")
            .style("stroke", "rgba(255, 255, 255, 0.05)")
            .style("stroke-width", 1);
    }






    // Method to handle year range updates from Timeline
    updateYearRange(yearRange) {
        let vis = this;
        vis.yearRange = yearRange;
        vis.wrangleData();
    }

    // Method to set timeline reference (for bidirectional highlight)
    setTimeline(timeline) {
        let vis = this;
        vis.timeline = timeline;
    }

    // Method to handle rating split threshold updates
    updateRatingSplit(threshold) {
        let vis = this;
        vis.ratingSplit = threshold;

        // Update color scale domain
        vis.colorScale.domain([vis.ratingSplit]);

        // Update legend labels to reflect new threshold
        vis.updateLegendLabels();

        // Re-wrangle data to re-bin movies
        vis.wrangleData();
    }

    // Method to highlight scatter points by year (bidirectional highlight: timeline → scatter)
    highlightYear(year) {
        let vis = this;

        vis.chartArea.selectAll(".dot")
            .classed("is-highlighted", d => year !== null && d.Released_Year === year)
            .classed("is-dimmed", d => year !== null && d.Released_Year !== year);
    }

    // Zoom event handler
    zoomed(event) {
        let vis = this;

        vis.currentTransform = event.transform;

        // Show reset view button when zoomed (not at identity)
        const shouldShowResetView = (event.transform.k !== 1 || event.transform.x !== 0 || event.transform.y !== 0);

        // Only update if state changed
        if (shouldShowResetView !== vis.resetViewVisible) {
            vis.resetViewVisible = shouldShowResetView;

            if (shouldShowResetView) {
                vis.svg.select(".reset-zoom-btn")
                    .attr("tabindex", "0") // Make tabbable when visible
                    .transition()
                    .duration(300)
                    .style("opacity", 1)
                    .style("pointer-events", "all");
            } else {
                vis.svg.select(".reset-zoom-btn")
                    .attr("tabindex", "-1") // Remove from tab order when hidden
                    .transition()
                    .duration(300)
                    .style("opacity", 0)
                    .style("pointer-events", "none");
            }

            // Update legend background only when state changes
            setTimeout(() => vis.updateLegendBackground(), 50);
        }

        // Create new scales based on zoom transform
        const newXScale = event.transform.rescaleX(vis.xScale);
        const newYScale = event.transform.rescaleY(vis.yScale);

        // During zoom, use automatic tick generation for y-axis to prevent clustering
        // Clear any custom tick values set by the compressed scale
        const yAxisForZoom = d3.axisLeft(newYScale)
            .tickFormat(d => `$${(d / 1000000).toFixed(0)}M`)
            .tickSizeOuter(0)
            .tickSizeInner(6)
            .tickPadding(8)
            .ticks(8); // Use automatic tick generation with ~8 ticks

        // Update axes with new scales
        vis.xAxisGroup.call(vis.xAxis.scale(newXScale));
        vis.yAxisGroup.call(yAxisForZoom);

        // Update dots positions with new scales
        vis.chartArea.selectAll(".dot")
            .attr("cx", d => newXScale(d.Released_Year))
            .attr("cy", d => newYScale(d.Gross));

        // Update annotations with zoom
        vis.updateAnnotationsWithZoom(newXScale, newYScale);
    }

    // Reset zoom to original view
    resetZoom() {
        let vis = this;

        vis.currentTransform = d3.zoomIdentity;

        // Apply the reset with a smooth transition
        vis.svgContainer.transition()
            .duration(750)
            .call(vis.zoom.transform, d3.zoomIdentity)
            .on("end", function() {
                // After zoom reset completes, redraw chart
                vis.updateVis();

                // Hide reset view button after reset completes with transition
                vis.svg.select(".reset-zoom-btn")
                    .attr("tabindex", "-1") // Remove from tab order when hidden
                    .transition()
                    .duration(300)
                    .style("opacity", 0)
                    .style("pointer-events", "none");
                vis.resetViewVisible = false;

                // Update legend background after hiding reset view button
                setTimeout(() => vis.updateLegendBackground(), 50);
            });
    }

    // Update annotations during zoom
    updateAnnotationsWithZoom(xScale, yScale) {
        let vis = this;

        // Ensure annotation group exists and has correct opacity
        vis.svg.selectAll(".annotation-group").style("opacity", 1);

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

        // Update annotation backgrounds - match each background to its specific label
        // Update first annotation background
        const bg1 = vis.svg.select(".annotation-bg-1");
        const label1 = vis.svg.select(".annotation-label");
        if (!bg1.empty() && !label1.empty() && label1.node()) {
            const labelBBox1 = label1.node().getBBox();
            bg1.attr("x", labelBBox1.x - 3)
                .attr("y", labelBBox1.y - 1)
                .attr("width", labelBBox1.width + 6)
                .attr("height", labelBBox1.height + 2)
                .style("opacity", 0.85);
        }

        // Update second annotation background
        const bg2 = vis.svg.select(".annotation-bg-2");
        const label2 = vis.svg.select(".annotation-label-2");
        if (!bg2.empty() && !label2.empty() && label2.node()) {
            const labelBBox2 = label2.node().getBBox();
            bg2.attr("x", labelBBox2.x - 3)
                .attr("y", labelBBox2.y - 1)
                .attr("width", labelBBox2.width + 6)
                .attr("height", labelBBox2.height + 2)
                .style("opacity", 0.85);
        }
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

    // Method to reset legend filters and threshold
    resetLegend() {
        let vis = this;

        // Reset visibility: turn both bands ON
        vis.visibleRatingBands.clear();
        vis.visibleRatingBands.add('high');
        vis.visibleRatingBands.add('low');

        // Reset threshold to default 8.0 (clamped to data extent)
        const defaultThreshold = 8.0;
        vis.ratingSplit = Math.max(vis.ratingExtent[0], Math.min(defaultThreshold, vis.ratingExtent[1]));

        // Update color scale domain with new threshold
        vis.colorScale.domain([vis.ratingSplit]);

        // Update threshold slider
        d3.select("#rating-threshold-slider").property("value", vis.ratingSplit);

        // Update legend labels and visual state
        vis.updateLegendLabels();
        vis.updateLegendState();

        // Refresh visualization
        vis.wrangleData();
    }

    // Method to update legend labels based on current threshold
    updateLegendLabels() {
        let vis = this;

        // Update legend item labels
        vis.svg.selectAll(".legend-item").each(function(d) {
            const newLabel = d.id === 'high'
                ? `High (≥${vis.ratingSplit.toFixed(1)})`
                : `Low (<${vis.ratingSplit.toFixed(1)})`;

            d3.select(this).select(".legend-label").text(newLabel);
        });

        // Update threshold display
        d3.select("#threshold-display").text(vis.ratingSplit.toFixed(1));

        // Update slider ARIA
        d3.select("#rating-threshold-slider")
            .attr("aria-valuenow", vis.ratingSplit)
            .attr("aria-valuetext", `High if rating ≥ ${vis.ratingSplit.toFixed(1)}, Low otherwise`);
    }

    // Show empty state overlay with context-aware message
    showEmptyStateOverlay() {
        let vis = this;

        // Remove existing overlay if present
        d3.select("#empty-state-overlay").remove();

        // Detect the reason for empty state
        let message1, message2, resetAction;

        if (vis.selectedGenres.size === 0) {
            // No genres selected
            message1 = "No genres selected.";
            message2 = 'Select genres from the dropdown or <span class="reset-link">reset all filters</span>.';
            resetAction = () => {
                // Reset all filters (same as Reset All button)
                vis.selectedGenres.clear();
                vis.genres.forEach(genre => vis.selectedGenres.add(genre));
                d3.select("#select-all").property("checked", true);
                d3.selectAll("#genre-dropdown input[type='checkbox']").property("checked", true);
                d3.select("#dropdown-text").text("All Genres");
                vis.wrangleData();
            };
        } else if (vis.visibleRatingBands.size === 0) {
            // No rating bands visible (both hidden)
            message1 = "No rating bands are visible.";
            message2 = 'Turn a band on in the legend or <span class="reset-link">reset legend</span>.';
            resetAction = () => vis.resetLegend();
        } else {
            // Other cases (e.g., year range filter, or slider at extreme with only band hidden)
            message1 = "No movies match the current filters.";
            message2 = 'Adjust filters or <span class="reset-link">reset all</span>.';
            resetAction = () => {
                // Full reset (same as Reset All button in main.js)
                vis.selectedGenres.clear();
                vis.genres.forEach(genre => vis.selectedGenres.add(genre));
                d3.select("#select-all").property("checked", true);
                d3.selectAll("#genre-dropdown input[type='checkbox']").property("checked", true);
                d3.select("#dropdown-text").text("All Genres");
                vis.resetLegend();
                // Note: Can't reset timeline from here without reference to myTimeline
            };
        }

        // Create overlay
        const overlay = d3.select(".main-chart-section")
            .append("div")
            .attr("id", "empty-state-overlay")
            .attr("class", "empty-state-overlay")
            .style("opacity", 0);

        overlay.append("p")
            .text(message1);

        overlay.append("p")
            .html(message2)
            .select(".reset-link")
            .on("click", resetAction);

        // Fade in
        overlay.transition()
            .duration(300)
            .style("opacity", 1);
    }

    // Hide empty state overlay
    hideEmptyStateOverlay() {
        d3.select("#empty-state-overlay")
            .transition()
            .duration(200)
            .style("opacity", 0)
            .remove();
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

    // Calculate and update per-band counts in legend
    updateLegendCounts() {
        let vis = this;

        // Calculate counts for data BEFORE legend visibility filter
        // Pipeline: year range → genre → re-bin by threshold, then count
        let dataBeforeLegend = vis.data.slice();

        // Apply year range filter
        if (vis.yearRange) {
            dataBeforeLegend = dataBeforeLegend.filter(d =>
                d.Released_Year >= vis.yearRange[0] && d.Released_Year <= vis.yearRange[1]
            );
        }

        // Apply genre filter
        if (vis.selectedGenres.size === 0) {
            dataBeforeLegend = [];
        } else {
            dataBeforeLegend = dataBeforeLegend.filter(d => {
                if (!d.Genre) return false;
                let movieGenres = d.Genre.split(',').map(g => g.trim());
                return movieGenres.some(genre => vis.selectedGenres.has(genre));
            });
        }

        // Re-bin by current threshold
        dataBeforeLegend.forEach(d => {
            d.ratingBand = d.IMDB_Rating >= vis.ratingSplit ? 'high' : 'low';
        });

        // Count movies per band
        const bandCounts = {
            high: dataBeforeLegend.filter(d => d.ratingBand === 'high').length,
            low: dataBeforeLegend.filter(d => d.ratingBand === 'low').length
        };

        // Update legend item counts and ghost state
        vis.svg.selectAll(".legend-item")
            .each(function(d) {
                const count = bandCounts[d.id] || 0;
                const countText = count === 1 ? "1 movie" : `${count} movies`;

                // Get label width to position count after it
                const labelElement = d3.select(this).select(".legend-label");
                const labelWidth = labelElement.node().getBBox().width;

                // Update count text - use middot separator, positioned after label
                d3.select(this).select(".legend-count")
                    .attr("x", 12 + labelWidth + 5)
                    .text(` · ${count}`);

                // Apply ghosted state if count is 0
                if (count === 0) {
                    d3.select(this).classed("ghosted", true);
                    d3.select(this).style("pointer-events", "none");
                } else {
                    d3.select(this).classed("ghosted", false);
                    d3.select(this).style("pointer-events", "all");
                }
            });
    }

    wrangleData() {
        let vis = this;

        // Reset keyboard navigation state when data changes
        if (vis.activeDotIndex !== null) {
            vis.activeDotIndex = null;
            // Clear active styling will happen during updateVis when dots are redrawn
        }

        // Start with all data
        vis.displayData = vis.data.slice();

        // Filter pipeline: timeline brush → genre → re-bin by threshold → legend visibility

        // 1. Filter by year range if brush is active
        if (vis.yearRange) {
            vis.displayData = vis.displayData.filter(d =>
                d.Released_Year >= vis.yearRange[0] && d.Released_Year <= vis.yearRange[1]
            );
        }

        // 2. Filter by genre
        if (vis.selectedGenres.size === 0) {
            vis.displayData = [];
        } else {
            vis.displayData = vis.displayData.filter(d => {
                if (!d.Genre) return false;
                let movieGenres = d.Genre.split(',').map(g => g.trim());
                return movieGenres.some(genre => vis.selectedGenres.has(genre));
            });
        }

        // 3. Re-bin by rating threshold (does NOT drop data, just assigns band)
        vis.displayData.forEach(d => {
            d.ratingBand = d.IMDB_Rating >= vis.ratingSplit ? 'high' : 'low';
        });

        // 4. Filter by rating band visibility (legend toggles)
        vis.displayData = vis.displayData.filter(d => vis.visibleRatingBands.has(d.ratingBand));

        vis.isInitialized = true;

        vis.displayData.sort((a, b) => a.IMDB_Rating - b.IMDB_Rating);

        // Update legend counts before updating statistics
        vis.updateLegendCounts();

        vis.updateStatistics();

        vis.updateVis();
    }

    updateStatistics() {
        let vis = this;

        d3.select("#movie-count").text(vis.displayData.length);

        if (vis.displayData.length > 0) {
            let avgGross = d3.mean(vis.displayData, d => d.Gross);
            d3.select("#avg-gross").text(`$${(avgGross / 1000000).toFixed(1)}M`);

            let minYear = d3.min(vis.displayData, d => d.Released_Year);
            let maxYear = d3.max(vis.displayData, d => d.Released_Year);
            d3.select("#year-range").text(`${minYear}-${maxYear}`);
        } else {
            d3.select("#avg-gross").text("$0M");
            d3.select("#year-range").text("-");
        }

        vis.updateFeaturedMovies();
    }

    updateFeaturedMovies() {
        let vis = this;

        if (vis.displayData.length === 0) {
            d3.select("#featured-movies").style("display", "none");
            return;
        }

        d3.select("#featured-movies").style("display", "block");

        let highestGrossing = vis.displayData.reduce((max, d) =>
            d.Gross > max.Gross ? d : max
        );

        d3.select("#highest-grossing-title").text(highestGrossing.Series_Title);
        d3.select("#highest-grossing-value").text(`$${(highestGrossing.Gross / 1000000).toFixed(1)}M (${highestGrossing.Released_Year})`);

        let highestRated = vis.displayData.reduce((max, d) =>
            d.IMDB_Rating > max.IMDB_Rating ? d : max
        );

        d3.select("#highest-rated-title").text(highestRated.Series_Title);
        d3.select("#highest-rated-value").text(`${highestRated.IMDB_Rating}/10 (${highestRated.Released_Year})`);

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

            // Show empty state overlay whenever no data is visible
            // (both bands hidden manually OR slider at extreme with only populated band hidden)
            vis.showEmptyStateOverlay();
            return;
        }

        // Hide empty state overlay when data is present
        vis.hideEmptyStateOverlay();

        if (vis.yearRange) {
            vis.xScale.domain([
                vis.yearRange[0] - 1,
                vis.yearRange[1] + 1
            ]);
        } else {
            vis.xScale.domain([
                d3.min(vis.data, d => d.Released_Year) - 2,
                d3.max(vis.data, d => d.Released_Year) + 2
            ]);
        }

        // Simple linear y-scale
        const grossMax = d3.max(vis.data, d => d.Gross) || 0;
        const million = 1000000;
        const paddedMax = grossMax === 0
            ? 100 * million
            : Math.ceil(((grossMax * 1.05) / million) / 25) * 25 * million;

        vis.yScale
            .domain([0, paddedMax])
            .range([vis.height, 0]);

        vis.yAxis.tickValues(null);

        // Update axes (apply zoom transform if exists)
        if (vis.currentTransform && (
            vis.currentTransform.k !== 1 ||
            vis.currentTransform.x !== 0 ||
            vis.currentTransform.y !== 0
        )) {
            const newXScale = vis.currentTransform.rescaleX(vis.xScale);
            const newYScale = vis.currentTransform.rescaleY(vis.yScale);
            vis.xAxisGroup.call(vis.xAxis.scale(newXScale));
            vis.yAxisGroup.call(vis.yAxis.scale(newYScale));
        } else {
            vis.xAxisGroup.call(vis.xAxis);
            vis.yAxisGroup.call(vis.yAxis);
        }


        // Bind data to circles (use chartArea for clipping)
        let circles = vis.chartArea.selectAll(".dot")
            .data(vis.displayData, d => d.Series_Title);

        circles.exit()
            .interrupt()
            .transition("exit")
            .duration(300)
            .attr("opacity", 0)
            .remove();

        let enterCircles = circles.enter()
            .append("circle")
            .attr("class", "dot")
            .attr("cx", d => vis.xScale(d.Released_Year))
            .attr("cy", d => vis.yScale(d.Gross))
            .attr("r", 5)
            .attr("fill", d => vis.colorScale(d.IMDB_Rating))
            .attr("stroke", "#ffffff")  // White stroke to match CSS
            .attr("stroke-width", 1)
            .attr("opacity", 0)
            // No tabindex - using roving tabindex pattern on container
            .attr("role", "button")
            .attr("aria-label", d => `${d.Series_Title}, ${d.Released_Year}, $${(d.Gross / 1000000).toFixed(1)}M gross, ${d.IMDB_Rating}/10 rating`);

        // Merge and update - interrupt ongoing transitions before updating
        const mergedCircles = enterCircles.merge(circles);

        // Apply current zoom transform if it exists (even when not in zoom mode)
        if (vis.currentTransform && (
            vis.currentTransform.k !== 1 ||
            vis.currentTransform.x !== 0 ||
            vis.currentTransform.y !== 0
        )) {
            const newXScale = vis.currentTransform.rescaleX(vis.xScale);
            const newYScale = vis.currentTransform.rescaleY(vis.yScale);
            mergedCircles
                .attr("cx", d => newXScale(d.Released_Year))
                .attr("cy", d => newYScale(d.Gross));
        }

        mergedCircles
            .on("mouseover", function (event, d) {
                // Mark that we're currently hovering over a dot
                vis.isHoveringDot = true;

                // ALWAYS cancel grace timer when hovering over ANY dot
                if (vis.timeline && vis.timeline.graceTimer) {
                    clearTimeout(vis.timeline.graceTimer);
                    vis.timeline.graceTimer = null;
                }

                // Clear keyboard navigation active dot when mouse interaction begins
                if (vis.activeDotIndex !== null) {
                    vis.chartArea.selectAll(".dot").classed("is-active", false);
                    vis.activeDotIndex = null;
                }

                // Bidirectional highlight: notify timeline of hovered year AND highlight same-year dots
                if (vis.timeline) {
                    vis.timeline.highlightYearOnTimeline(d.Released_Year);
                }
                // Highlight all dots from the same year (consistent with timeline hover behavior)
                vis.highlightYear(d.Released_Year);

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

                // Use requestAnimationFrame to ensure highlights are painted before positioning tooltip
                requestAnimationFrame(() => {
                    // Smart positioning to keep tooltip within viewport, avoid timeline AND highlighted dots
                    const tooltipNode = tooltip.node();
                    const tooltipRect = tooltipNode.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    // Get timeline position to avoid covering it
                    const timelineElement = document.getElementById('slider-chart');
                    const timelineRect = timelineElement ? timelineElement.getBoundingClientRect() : null;

                    // Get positions of highlighted dots AND the hovered dot to avoid covering them
                    const dotsToAvoid = [];

                    // Add all highlighted dots
                    vis.chartArea.selectAll(".dot.is-highlighted").each(function() {
                        const rect = this.getBoundingClientRect();
                        dotsToAvoid.push({
                            left: rect.left,
                            right: rect.right,
                            top: rect.top,
                            bottom: rect.bottom,
                            centerX: rect.left + rect.width / 2,
                            centerY: rect.top + rect.height / 2
                        });
                    });

                    // Also add the currently hovered dot (with larger bounds since it's enlarged)
                    const hoveredDotRect = this.getBoundingClientRect();
                    dotsToAvoid.push({
                        left: hoveredDotRect.left,
                        right: hoveredDotRect.right,
                        top: hoveredDotRect.top,
                        bottom: hoveredDotRect.bottom,
                        centerX: hoveredDotRect.left + hoveredDotRect.width / 2,
                        centerY: hoveredDotRect.top + hoveredDotRect.height / 2
                    });

                    // Position tooltip relative to DOT (not cursor) for consistent spacing
                    const buffer = 20; // Buffer space around dots for overlap detection
                    const tooltipOffset = 30; // Consistent offset from dot edge (must be > buffer)

                    // Helper function to check if a position overlaps with any dots
                    const overlapsAnyDot = (tooltipLeft, tooltipTop) => {
                        const tooltipRight = tooltipLeft + tooltipRect.width;
                        const tooltipBottom = tooltipTop + tooltipRect.height;

                        for (const dot of dotsToAvoid) {
                            const overlapsH = tooltipLeft < dot.right + buffer && tooltipRight > dot.left - buffer;
                            const overlapsV = tooltipTop < dot.bottom + buffer && tooltipBottom > dot.top - buffer;
                            if (overlapsH && overlapsV) {
                                return true;
                            }
                        }
                        return false;
                    };

                    // Helper function to check if position is within viewport
                    const isInViewport = (tooltipLeft, tooltipTop) => {
                        return tooltipLeft >= 10 &&
                               tooltipTop >= 10 &&
                               tooltipLeft + tooltipRect.width <= viewportWidth - 10 &&
                               tooltipTop + tooltipRect.height <= viewportHeight - 10;
                    };

                    // Helper to check if position overlaps timeline
                    const overlapsTimeline = (tooltipTop) => {
                        if (!timelineRect) return false;
                        const tooltipBottom = tooltipTop + tooltipRect.height;
                        return tooltipBottom + 20 > timelineRect.top;
                    };

                    // Define candidate positions in priority order
                    // All positions are relative to the DOT, not cursor, for consistent spacing
                    const candidates = [];

                    // Use the hovered dot's bounds as reference point
                    const dotCenterX = dotsToAvoid[dotsToAvoid.length - 1].centerX;
                    const dotCenterY = dotsToAvoid[dotsToAvoid.length - 1].centerY;
                    const dotRight = dotsToAvoid[dotsToAvoid.length - 1].right;
                    const dotLeft = dotsToAvoid[dotsToAvoid.length - 1].left;
                    const dotTop = dotsToAvoid[dotsToAvoid.length - 1].top;
                    const dotBottom = dotsToAvoid[dotsToAvoid.length - 1].bottom;

                    // 1. Right of dot - vertically centered (default preference)
                    candidates.push({
                        left: dotRight + tooltipOffset,
                        top: dotCenterY - tooltipRect.height / 2,
                        priority: 1
                    });

                    // 2. Left of dot - vertically centered
                    candidates.push({
                        left: dotLeft - tooltipRect.width - tooltipOffset,
                        top: dotCenterY - tooltipRect.height / 2,
                        priority: 2
                    });

                    // 3. Above dot - horizontally centered
                    candidates.push({
                        left: dotCenterX - tooltipRect.width / 2,
                        top: dotTop - tooltipRect.height - tooltipOffset,
                        priority: 3
                    });

                    // 4. Below dot - horizontally centered (if not near timeline)
                    if (!timelineRect || dotBottom + tooltipRect.height + tooltipOffset + 50 < timelineRect.top) {
                        candidates.push({
                            left: dotCenterX - tooltipRect.width / 2,
                            top: dotBottom + tooltipOffset,
                            priority: 4
                        });
                    }

                    // 5. Right of dot - aligned with top
                    candidates.push({
                        left: dotRight + tooltipOffset,
                        top: dotTop,
                        priority: 5
                    });

                    // 6. Left of dot - aligned with top
                    candidates.push({
                        left: dotLeft - tooltipRect.width - tooltipOffset,
                        top: dotTop,
                        priority: 6
                    });

                    // 7. Right of dot - aligned with bottom
                    candidates.push({
                        left: dotRight + tooltipOffset,
                        top: dotBottom - tooltipRect.height,
                        priority: 7
                    });

                    // 8. Left of dot - aligned with bottom
                    candidates.push({
                        left: dotLeft - tooltipRect.width - tooltipOffset,
                        top: dotBottom - tooltipRect.height,
                        priority: 8
                    });

                    // Find the best valid candidate
                    let bestPosition = null;

                    for (const candidate of candidates) {
                        // Check all constraints
                        if (isInViewport(candidate.left, candidate.top) &&
                            !overlapsAnyDot(candidate.left, candidate.top) &&
                            !overlapsTimeline(candidate.top)) {
                            bestPosition = candidate;
                            break; // Use first valid candidate (highest priority)
                        }
                    }

                    // If no perfect position found, use the highest priority candidate
                    // and clamp to viewport bounds (accepting some overlap as last resort)
                    if (!bestPosition) {
                        bestPosition = candidates[0]; // Default to right of dot (highest priority)
                    }

                    let left = bestPosition.left;
                    let top = bestPosition.top;

                    // Final viewport clamping
                    left = Math.max(10, Math.min(left, viewportWidth - tooltipRect.width - 10));
                    top = Math.max(10, Math.min(top, viewportHeight - tooltipRect.height - 10));

                    // Last check: if still overlapping timeline, push above it
                    if (timelineRect && top + tooltipRect.height + 20 > timelineRect.top) {
                        top = Math.max(10, timelineRect.top - tooltipRect.height - 30);
                    }

                    tooltip
                        .style("left", left + "px")
                        .style("top", top + "px");
                }); // Close requestAnimationFrame

                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("r", 8)
                    .attr("fill", d => vis.colorScale(d.IMDB_Rating))
                    .style("stroke", "#e50914")
                    .style("stroke-width", "2px");
            })
            .on("mouseout", function (event, d) {
                // Mark that we're no longer hovering over this specific dot
                vis.isHoveringDot = false;

                // Don't clear timeline pulse or dot highlights here - let them persist while moving between dots
                // They will be cleared by chartArea mouseleave handler or grace timer

                // Start grace timer to clear scatter highlights (not locked)
                if (vis.timeline && !vis.timeline.isLocked && !vis.timeline.graceTimer) {
                    vis.timeline.graceTimer = setTimeout(() => {
                        // Only clear if we're still not hovering over any dot
                        if (!vis.isHoveringDot) {
                            // Clear dot highlights directly (don't use onYearHover to avoid conflicts)
                            vis.chartArea.selectAll(".dot")
                                .classed("is-highlighted", false)
                                .classed("is-dimmed", false);
                            // Hide timeline hairline
                            if (vis.timeline.hairlineGroup) {
                                vis.timeline.hairlineGroup.style("opacity", 0);
                            }
                            vis.timeline.hoveredYear = null;
                        }
                        vis.timeline.graceTimer = null;
                    }, 150); // Shorter grace period for quicker response
                }

                d3.select("#tooltip").classed("visible", false);

                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("r", 5)
                    .attr("fill", vis.colorScale(d.IMDB_Rating))
                    .style("stroke", "#ffffff")  // Reset to white stroke to match CSS
                    .style("stroke-width", "1px");
            })
            // No focus/blur handlers - using roving tabindex pattern on container
            .interrupt() // Stop any ongoing transitions
            .transition("update")
            .duration(300)
            .attr("cx", d => {
                if (vis.currentTransform && (
                    vis.currentTransform.k !== 1 ||
                    vis.currentTransform.x !== 0 ||
                    vis.currentTransform.y !== 0
                )) {
                    const newXScale = vis.currentTransform.rescaleX(vis.xScale);
                    return newXScale(d.Released_Year);
                }
                return vis.xScale(d.Released_Year);
            })
            .attr("cy", d => {
                if (vis.currentTransform && (
                    vis.currentTransform.k !== 1 ||
                    vis.currentTransform.x !== 0 ||
                    vis.currentTransform.y !== 0
                )) {
                    const newYScale = vis.currentTransform.rescaleY(vis.yScale);
                    return newYScale(d.Gross);
                }
                return vis.yScale(d.Gross);
            })
            .attr("r", 5)
            .attr("fill", d => vis.colorScale(d.IMDB_Rating))
            .attr("opacity", 0.8);

        // Re-apply locked year highlights after rendering (if timeline is locked)
        if (vis.timeline && vis.timeline.isLocked && vis.timeline.lockedYear) {
            vis.highlightYear(vis.timeline.lockedYear);
        }

        // Add annotations for insights
        vis.drawAnnotations();
    }

    drawAnnotations() {
        let vis = this;

        // Remove old annotations (including any lingering opacity styles)
        vis.svg.selectAll(".annotation-group").interrupt().remove();

        // Also remove any orphaned annotation elements
        vis.svg.selectAll(".annotation-line").remove();
        vis.svg.selectAll(".annotation-label").remove();
        vis.svg.selectAll(".annotation-label-2").remove();

        if (vis.displayData.length === 0) return;

        // Create annotation group with explicit opacity
        let annotationGroup = vis.svg.append("g")
            .attr("class", "annotation-group")
            .style("opacity", 1);  // Ensure group itself is fully opaque

        // Check if we have a zoom transform applied
        // If zoomed, we skip animations for cleaner rendering
        const isZoomed = vis.currentTransform && (
            vis.currentTransform.k !== 1 ||
            vis.currentTransform.x !== 0 ||
            vis.currentTransform.y !== 0
        );

        // Find highest grossing movie
        let highestGrossing = vis.displayData.reduce((max, d) =>
            d.Gross > max.Gross ? d : max
        );

        // Add annotation for highest grossing movie
        if (highestGrossing) {
            // Apply current zoom transform if it exists (check for any transform, not just scale)
            let xScale = vis.xScale;
            let yScale = vis.yScale;

            if (isZoomed) {
                xScale = vis.currentTransform.rescaleX(vis.xScale);
                yScale = vis.currentTransform.rescaleY(vis.yScale);
            }

            let x = xScale(highestGrossing.Released_Year);
            let y = yScale(highestGrossing.Gross);

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
            let fullText = `💰 ${highestGrossing.Series_Title}`;

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
                fullText = `💰 ${titleText}`;

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
            // Skip animation if we're zoomed in (annotations are being redrawn)
            const lineElement = annotationGroup.append("line")
                .attr("class", "annotation-line")
                .datum({Released_Year: highestGrossing.Released_Year, Gross: highestGrossing.Gross, annotateAbove: annotateAbove})
                .attr("x1", x)
                .attr("y1", lineY1)
                .attr("x2", x)
                .attr("y2", lineY2)
                .style("stroke", "#e50914")
                .style("stroke-width", 2)
                .style("fill", "none");  // No fill for lines

            if (isZoomed) {
                lineElement.style("opacity", 1);
            } else {
                lineElement
                    .style("opacity", 0)
                    .transition()
                    .duration(500)
                    .delay(400)
                    .style("opacity", 1);
            }

            // Add label with data for zoom updates
            const labelElement = annotationGroup.append("text")
                .attr("class", "annotation-label")
                .datum({Released_Year: highestGrossing.Released_Year, Gross: highestGrossing.Gross, annotateAbove: annotateAbove, textAnchor: textAnchor})
                .attr("x", labelX)
                .attr("y", labelY)
                .style("text-anchor", textAnchor)
                .style("fill", "#e50914")
                .style("font-weight", "bold")
                .style("font-size", "11px")
                .text(fullText);

            if (isZoomed) {
                labelElement.style("opacity", 1);
            } else {
                labelElement
                    .style("opacity", 0)
                    .transition()
                    .duration(500)
                    .delay(400)
                    .style("opacity", 1);
            }

            // Add subtle background for readability
            let labelBBox = annotationGroup.select(".annotation-label").node().getBBox();
            const bgRect = annotationGroup.insert("rect", ".annotation-label")
                .attr("class", "annotation-bg-1")
                .attr("x", labelBBox.x - 3)
                .attr("y", labelBBox.y - 1)
                .attr("width", labelBBox.width + 6)
                .attr("height", labelBBox.height + 2)
                .style("fill", "#111");

            if (isZoomed) {
                bgRect.style("opacity", 0.85);
            } else {
                bgRect
                    .style("opacity", 0)
                    .transition()
                    .duration(500)
                    .delay(400)
                    .style("opacity", 0.85);
            }
        }

        // Find highest rated movie (absolute highest, not just blockbusters)
        // This ensures sync with Featured Movies panel
        let highestRated = vis.displayData.reduce((max, d) =>
            d.IMDB_Rating > max.IMDB_Rating ? d : max
        );

        if (highestRated) {
            // Only show if different from highest grossing
            if (highestRated.Series_Title !== highestGrossing.Series_Title) {
                // Apply current zoom transform if it exists
                let xScale = vis.xScale;
                let yScale = vis.yScale;

                if (isZoomed) {
                    xScale = vis.currentTransform.rescaleX(vis.xScale);
                    yScale = vis.currentTransform.rescaleY(vis.yScale);
                }

                let x = xScale(highestRated.Released_Year);
                let y = yScale(highestRated.Gross);

                // Store first annotation position for collision detection
                let firstAnnotationX = xScale(highestGrossing.Released_Year);
                let firstAnnotationY = yScale(highestGrossing.Gross);
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
                // Use isZoomed from parent scope
                const lineElement2 = annotationGroup.append("line")
                    .attr("class", "annotation-line")
                    .datum({Released_Year: highestRated.Released_Year, Gross: highestRated.Gross, annotateAbove: annotateAbove})
                    .attr("x1", x)
                    .attr("y1", lineY1)
                    .attr("x2", x)
                    .attr("y2", lineY2)
                    .style("stroke", "#e50914")  // Use same color as highest grossing for consistency
                    .style("stroke-width", 2)
                    .style("fill", "none");  // No fill for lines

                if (isZoomed) {
                    lineElement2.style("opacity", 1);
                } else {
                    lineElement2
                        .style("opacity", 0)
                        .transition()
                        .duration(500)
                        .delay(600)
                        .style("opacity", 1);
                }

                // Add label with data for zoom updates
                const labelElement2 = annotationGroup.append("text")
                    .attr("class", "annotation-label annotation-label-2")
                    .datum({Released_Year: highestRated.Released_Year, Gross: highestRated.Gross, annotateAbove: annotateAbove, textAnchor: textAnchor})
                    .attr("x", labelX)
                    .attr("y", labelY)
                    .style("text-anchor", textAnchor)
                    .style("fill", "#e50914")  // Use same color as highest grossing for consistency
                    .style("font-weight", "bold")
                    .style("font-size", "11px")
                    .text(fullText);

                if (isZoomed) {
                    labelElement2.style("opacity", 1);
                } else {
                    labelElement2
                        .style("opacity", 0)
                        .transition()
                        .duration(500)
                        .delay(600)
                        .style("opacity", 1);
                }

                // Add subtle background for readability (second annotation)
                let labelBBox2 = annotationGroup.select(".annotation-label-2").node().getBBox();
                const bgRect2 = annotationGroup.insert("rect", ".annotation-label-2")
                    .attr("class", "annotation-bg-2")
                    .attr("x", labelBBox2.x - 3)
                    .attr("y", labelBBox2.y - 1)
                    .attr("width", labelBBox2.width + 6)
                    .attr("height", labelBBox2.height + 2)
                    .style("fill", "#111");

                if (isZoomed) {
                    bgRect2.style("opacity", 0.85);
                } else {
                    bgRect2
                        .style("opacity", 0)
                        .transition()
                        .duration(500)
                        .delay(600)
                        .style("opacity", 0.85);
                }
            }
        }
    }

    // Handle keyboard navigation for roving tabindex pattern
    handleKeyboardNavigation(event) {
        let vis = this;

        // Ignore keyboard input if container is not focused
        if (!vis.isContainerFocused) return;

        if (vis.displayData.length === 0) return;

        // Sort data by year (x-axis position) for spatial navigation
        // Secondary sort by gross (y-axis) for movies in the same year
        const sortedByPosition = [...vis.displayData].sort((a, b) => {
            if (a.Released_Year !== b.Released_Year) {
                return a.Released_Year - b.Released_Year; // Earlier years first (left to right)
            }
            return a.Gross - b.Gross; // Lower gross first (bottom to top)
        });

        // Initialize active dot if not set (first key press) - start with earliest year
        if (vis.activeDotIndex === null) {
            vis.activeDotIndex = 0;
            vis.updateActiveDot();
            return;
        }

        // Find current dot in sorted array
        const currentDatum = vis.displayData[vis.activeDotIndex];
        const currentSortedIndex = sortedByPosition.findIndex(d => d === currentDatum);

        let handled = false;
        let newSortedIndex = currentSortedIndex;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
                // Move to next dot (later year, or higher gross in same year)
                newSortedIndex = Math.min(sortedByPosition.length - 1, currentSortedIndex + 1);
                handled = true;
                break;

            case "ArrowLeft":
            case "ArrowUp":
                // Move to previous dot (earlier year, or lower gross in same year)
                newSortedIndex = Math.max(0, currentSortedIndex - 1);
                handled = true;
                break;

            case "Home":
                // Jump to earliest year
                newSortedIndex = 0;
                handled = true;
                break;

            case "End":
                // Jump to latest year
                newSortedIndex = sortedByPosition.length - 1;
                handled = true;
                break;

            case "Enter":
            case " ": // Space
                // "Activate" current dot - for now just keep current behavior
                handled = true;
                break;
        }

        if (handled) {
            event.preventDefault();
            if (newSortedIndex !== currentSortedIndex) {
                // Find the new datum in the original displayData array
                const newDatum = sortedByPosition[newSortedIndex];
                const newIndex = vis.displayData.findIndex(d => d === newDatum);
                vis.activeDotIndex = newIndex;
                vis.updateActiveDot();
            }
        }
    }

    // Update visual styling for the active dot
    updateActiveDot() {
        let vis = this;

        if (vis.activeDotIndex === null || vis.displayData.length === 0) return;

        const activeDatum = vis.displayData[vis.activeDotIndex];

        // Remove active styling from all dots
        vis.chartArea.selectAll(".dot")
            .classed("is-active", false)
            .attr("r", 5)
            .style("stroke", "#ffffff")
            .style("stroke-width", "1px");

        // Apply active styling to the current dot
        const dots = vis.chartArea.selectAll(".dot").nodes();
        const activeDot = d3.select(dots[vis.activeDotIndex]);

        activeDot
            .classed("is-active", true)
            .attr("r", 8)
            .style("stroke", "#e50914")
            .style("stroke-width", "2px");

        // Trigger timeline pulse for active dot AND highlight same-year dots
        if (vis.timeline) {
            vis.timeline.highlightYearOnTimeline(activeDatum.Released_Year);
        }
        // Highlight all dots from the same year (consistent with hover behavior)
        vis.highlightYear(activeDatum.Released_Year);

        // Update ARIA live region to announce the active movie
        vis.announceActiveDot(activeDatum);
    }

    // Announce active dot to screen readers
    announceActiveDot(datum) {
        // Create or update an ARIA live region
        let liveRegion = document.getElementById('scatter-live-region');
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'scatter-live-region';
            liveRegion.className = 'sr-only';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            document.body.appendChild(liveRegion);
        }

        liveRegion.textContent = `${datum.Series_Title}, ${datum.Released_Year}, $${(datum.Gross / 1000000).toFixed(1)} million gross, ${datum.IMDB_Rating} out of 10 rating`;
    }
}