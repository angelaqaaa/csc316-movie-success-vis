class plotChart {
    constructor(_parentElement, _data) {
        this.parentElement = _parentElement;
        this.data = _data;
        this.displayData = [];
        this.selectedGenres = new Set(); // Changed to Set for multiple selections
        this.yearRange = null;
        this.isInitialized = false; // Track if charts have been initialized

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

        // Get the actual dimensions of the container
        let container = document.getElementById("main-chart");
        let containerWidth = container ? container.getBoundingClientRect().width : 1400;
        let containerHeight = container ? container.getBoundingClientRect().height : 500;

        // Use the full container dimensions minus margins
        vis.width = containerWidth - vis.margin.left - vis.margin.right;
        vis.height = Math.max(containerHeight - vis.margin.top - vis.margin.bottom, 300);

        // Create main SVG
        vis.svg = d3.select("#main-chart")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            .append("g")
            .attr("transform", `translate(${vis.margin.left}, ${vis.margin.top})`);

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


        vis.xAxisGroup = vis.svg.append("g")
            .attr("class", "axis x-axis")
            .attr("transform", `translate(0, ${vis.height})`);

        vis.yAxisGroup = vis.svg.append("g")
            .attr("class", "axis y-axis");

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

        // ===== Add Color Legend =====
        // Legend position: top right of y-axis
        const legendSpacing = 28;

        const legendData = [
            { color: "#ff2919ff", label: "High (≥8) IMDB Rating" },
            { color: "#005AB5", label: "Low (<8) IMDB Rating" }
        ];

        const legend = vis.svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(80,0)`);

        legend.selectAll("circle")
            .data(legendData)
            .enter()
            .append("circle")
            .attr("cx", 0)
            .attr("cy", (d, i) => i * legendSpacing)
            .attr("r", 6)
            .attr("fill", d => d.color)
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5);

        legend.selectAll("text")
            .data(legendData)
            .enter()
            .append("text")
            .attr("x", 12)
            .attr("y", (d, i) => i * legendSpacing + 4)
            .text(d => d.label);
    }





    // Method to handle year range updates from Timeline
    updateYearRange(yearRange) {
        let vis = this;
        vis.yearRange = yearRange;
        vis.wrangleData();
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
            vis.svg.selectAll(".dot").remove();
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

        // Bind data to circles
        let circles = vis.svg.selectAll(".dot")
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
            .attr("opacity", 0);

        // Merge and update - interrupt ongoing transitions before updating
        enterCircles.merge(circles)
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
                    .style("stroke", "#ffffff");
            })
            .interrupt() // Stop any ongoing transitions
            .transition("update")
            .duration(300)
            .attr("cx", d => vis.xScale(d.Released_Year))
            .attr("cy", d => vis.yScale(d.Gross))
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

            // Position annotation with more clearance (20px from point, 50px connector line)
            let lineY1, lineY2, labelY;
            if (annotateAbove) {
                // Annotation above the point
                lineY1 = y - 20;  // 20px clearance from point
                lineY2 = y - 70;  // 50px connector line
                labelY = y - 75;  // 5px beyond line end
            } else {
                // Annotation below the point
                lineY1 = y + 20;
                lineY2 = y + 70;
                labelY = y + 85;  // More space below
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

            // Add connector line
            annotationGroup.append("line")
                .attr("class", "annotation-line")
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

            // Add label
            annotationGroup.append("text")
                .attr("class", "annotation-label")
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

        // Find highest rated movie with significant gross (top 20% of revenue)
        let grossThreshold = d3.quantile(vis.displayData.map(d => d.Gross).sort((a, b) => a - b), 0.8);
        let highRatedBlockbusters = vis.displayData.filter(d => d.Gross >= grossThreshold);

        if (highRatedBlockbusters.length > 0) {
            let bestBlockbuster = highRatedBlockbusters.reduce((max, d) =>
                d.IMDB_Rating > max.IMDB_Rating ? d : max
            );

            // Only show if different from highest grossing
            if (bestBlockbuster.Series_Title !== highestGrossing.Series_Title) {
                let x = vis.xScale(bestBlockbuster.Released_Year);
                let y = vis.yScale(bestBlockbuster.Gross);

                // Determine if annotation should go above or below based on position
                let spaceAbove = y;
                let spaceBelow = vis.height - y;
                let annotateAbove = spaceAbove > 100; // Need at least 100px above

                // Position annotation with more clearance (20px from point, 50px connector line)
                let lineY1, lineY2, labelY;
                if (annotateAbove) {
                    lineY1 = y - 20;  // 20px clearance from point
                    lineY2 = y - 70;  // 50px connector line
                    labelY = y - 75;  // 5px beyond line end
                } else {
                    lineY1 = y + 20;
                    lineY2 = y + 70;
                    labelY = y + 85;  // More space below
                }

                // Start with full title including rating
                let titleText = bestBlockbuster.Series_Title;
                let fullText = `⭐ ${titleText} (${bestBlockbuster.IMDB_Rating}/10)`;

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
                    let ratingPart = ` (${bestBlockbuster.IMDB_Rating}/10)`;
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

                // Add connector line
                annotationGroup.append("line")
                    .attr("class", "annotation-line")
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

                // Add label
                annotationGroup.append("text")
                    .attr("class", "annotation-label annotation-label-2")
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