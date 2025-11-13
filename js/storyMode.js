/**
 * StoryManager - Manages the 5-step guided narrative for the movie visualization
 * Implements the "Martini Glass" narrative format: Author-driven → Reader-driven
 */

class StoryManager {
    constructor(plotChart, timeline) {
        this.plotChart = plotChart;
        this.timeline = timeline;
        this.currentStep = -1;
        this.userState = null;

        // Define the 5-step story arc
        this.storySteps = [
            { // Step 0: The Hook
                caption: "Welcome! Let's explore the relationship between critical acclaim and commercial success in cinema. We'll start with a full view of IMDb's top-rated movies from 1921-2019.",
                yearRange: null, // Show all years
                genres: 'All',
                annotations: [],
                clickableMovies: null,
                requireClickToAdvance: false
            },
            { // Step 1: Golden Age (1930-1975)
                caption: `During the "Golden Age" (1930-1975), many celebrated films were also strong earners for their time. Films like <strong>The Godfather</strong> exemplify this alignment. <span class="story-badge">Trend: Aligned</span>`,
                yearRange: [1930, 1975],
                genres: 'All',
                annotations: ["The Godfather"],
                clickableMovies: null,
                requireClickToAdvance: false
            },
            { // Step 2: The Blockbuster Era (1975-1985)
                caption: `In the 1970s, the "Blockbuster" was born. Films like <strong>Star Wars</strong> and <strong>Jaws</strong> proved that Action and Sci-Fi could dominate both critically and commercially.<br><br><strong>👉 Click the annotated dot for Star Wars to continue.</strong>`,
                yearRange: [1975, 1985],
                genres: ['Action', 'Adventure', 'Sci-Fi'],
                annotations: ["Star Wars", "Jaws"],
                clickableMovies: ["Star Wars"],
                requireClickToAdvance: true
            },
            { // Step 3: The Great Divergence (1990-2019)
                caption: `In the modern era (1990-2019), two distinct success patterns emerged:<br>• <strong>Critic-Proof Hits</strong> like <em>Star Wars: Episode VII</em> (high revenue, lower ratings)<br>• <strong>Acclaimed Gems</strong> like <em>The Shawshank Redemption</em> (high ratings, moderate revenue)<br><br><span class="story-badge">Correlation: Weak</span><br><br><strong>👉 Click either highlighted film to continue.</strong>`,
                yearRange: [1990, 2019],
                genres: 'All',
                annotations: ["The Shawshank Redemption", "Star Wars: Episode VII - The Force Awakens"],
                clickableMovies: ["The Shawshank Redemption", "Star Wars: Episode VII - The Force Awakens"],
                requireClickToAdvance: true
            },
            { // Step 4: Your Turn
                caption: `Now you've seen the story. The narrative is yours to continue.<br><br>We've returned to your original view. Use the filters, timeline, and zoom to explore for yourself!`,
                yearRange: null, // Will be handled by state restore
                genres: null, // Will be handled by state restore
                annotations: [],
                clickableMovies: null,
                requireClickToAdvance: false
            }
        ];

        // Bind methods
        this.init = this.init.bind(this);
        this.startStory = this.startStory.bind(this);
        this.endStory = this.endStory.bind(this);
        this.goToStep = this.goToStep.bind(this);
        this.snapshotState = this.snapshotState.bind(this);
        this.restoreState = this.restoreState.bind(this);
        this.resizeVisualization = this.resizeVisualization.bind(this);
    }

    init() {
        // Bind UI events
        d3.select('#start-story-btn').on('click', this.startStory);
        d3.select('#end-story-btn').on('click', this.endStory);
        d3.select('#story-next-btn').on('click', () => this.goToStep(this.currentStep + 1));
        d3.select('#story-prev-btn').on('click', () => this.goToStep(this.currentStep - 1));
    }

    snapshotState() {
        // Capture user's current state for restoration later
        this.userState = {
            plotState: this.plotChart.getStateSnapshot(),
            timelineState: this.timeline.getBrushState()
        };

        console.log("User state snapshot captured:", this.userState);
    }

    restoreState() {
        if (!this.userState) return;

        // Restore timeline first (triggers chart update via callback)
        if (this.userState.timelineState) {
            this.timeline.programmaticBrush(this.userState.timelineState, 750);
        } else {
            this.timeline.programmaticBrush(null, 750);
        }

        // Restore plot state
        setTimeout(() => {
            this.plotChart.restoreStateSnapshot(this.userState.plotState);
        }, 100);

        console.log("User state restored");
    }

    resizeVisualization(enableStoryMode) {
        // Resize the visualization container to make space for story panel
        const storyPanelWidth = 380; // Must match CSS .story-panel width
        const container = document.querySelector('.container');

        if (enableStoryMode) {
            // Shrink container to make space for panel
            container.style.marginRight = `${storyPanelWidth}px`;
        } else {
            // Restore to full width
            container.style.marginRight = '0';
        }

        // Trigger resize on plotChart and timeline to recalculate dimensions
        // Give DOM a moment to update layout before recalculating
        setTimeout(() => {
            this.plotChart.handleResize();
            this.timeline.handleResize();
        }, 50);
    }

    startStory() {
        // Snapshot user's current state
        this.snapshotState();

        // Set story mode flags (prevents interactive handlers from firing/re-attaching)
        this.plotChart.isStoryModeActive = true;
        this.timeline.isStoryModeActive = true;

        // Show story panel and apply layout changes
        d3.select('body').classed('story-mode-active', true);
        d3.select('#story-panel').style('display', 'block');
        d3.select('#start-story-btn').style('display', 'none');

        // Add overlay to dim other UI elements
        d3.select('body').append('div')
            .attr('id', 'story-overlay')
            .attr('class', 'story-overlay')
            .on('click', (event) => {
                // Only exit if clicking the overlay itself, not elements on top of it
                if (event.target.id === 'story-overlay') {
                    this.endStory();
                }
            });

        // Disable interactive controls
        this.plotChart.disableZoomPan();
        this.timeline.disableBrush();
        d3.select('#genreDropdownButton').property('disabled', true);
        d3.select('#reset-filters').property('disabled', true);
        d3.select('#reset-timeline').property('disabled', true);

        // Disable ALL legend interactions (rating split slider + band toggles)
        d3.selectAll('.legend-item')
            .style('cursor', 'not-allowed')
            .style('opacity', '0.5')
            .on('click', null)     // Remove click handlers
            .on('keydown', null);  // Remove keyboard handlers
        d3.select('#rating-threshold-slider').property('disabled', true);

        // Disable timeline hover/lock interactions
        this.timeline.svg.on('mousemove.highlight', null);
        this.timeline.svg.on('mouseleave.highlight', null);
        this.timeline.svg.on('click.lock', null);
        this.timeline.svg.on('dblclick.lock', null);

        // Disable dot hover highlighting (remove actual handlers, not namespaced)
        this.plotChart.chartArea.selectAll('.dot')
            .on('mouseover', null)
            .on('mouseout', null)
            .on('focus', null)
            .on('blur', null);

        // Disable tooltips during story mode
        d3.select('#tooltip').classed('story-mode-hidden', true);

        // Resize visualization to make space for panel
        this.resizeVisualization(true);

        // Start at step 0
        this.goToStep(0);
    }

    endStory() {
        // Reset story mode flags (re-enable interactive handlers)
        this.plotChart.isStoryModeActive = false;
        this.timeline.isStoryModeActive = false;

        // Remove story panel and overlay
        d3.select('body').classed('story-mode-active', false);
        d3.select('#story-panel').style('display', 'none');
        d3.select('#start-story-btn').style('display', 'inline-block');
        d3.select('#story-overlay').remove();

        // Re-enable interactive controls
        this.plotChart.enableZoomPan();
        this.timeline.enableBrush();
        d3.select('#genreDropdownButton').property('disabled', false);
        d3.select('#reset-filters').property('disabled', false);
        d3.select('#reset-timeline').property('disabled', false);

        // Re-enable legend interactions (slider + band toggles)
        const plotChart = this.plotChart;
        d3.selectAll('.legend-item')
            .style('cursor', null)
            .style('opacity', null)
            .on('click', function(event, d) {
                this.blur();
                plotChart.toggleRatingBand(d.id);
            })
            .on('keydown', function(event, d) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.blur();
                    plotChart.toggleRatingBand(d.id);
                }
            });
        d3.select('#rating-threshold-slider').property('disabled', false);

        // Re-enable timeline interactions (need to call timeline's init method bindings)
        // Re-attach the event handlers that were removed
        const timeline = this.timeline;
        timeline.svg
            .on("mousemove.highlight", function(event) {
                if (timeline.graceTimer) {
                    clearTimeout(timeline.graceTimer);
                    timeline.graceTimer = null;
                }
                if (timeline.isLocked) return;
                if (timeline.animationFrame) return;

                timeline.animationFrame = requestAnimationFrame(() => {
                    const [mouseX] = d3.pointer(event, this);
                    let hoveredYear = Math.round(timeline.xScale.invert(mouseX));
                    const [minDomain, maxDomain] = timeline.xScale.domain();
                    hoveredYear = Math.max(minDomain, Math.min(maxDomain, hoveredYear));

                    const xPos = timeline.xScale(hoveredYear);
                    timeline.hairlineGroup
                        .attr("transform", `translate(${xPos}, 0)`)
                        .style("opacity", 1);

                    timeline.hairlineLabel.text(hoveredYear);
                    const labelBBox = timeline.hairlineLabel.node().getBBox();
                    timeline.hairlineLabelBg
                        .attr("x", -labelBBox.width / 2 - 4)
                        .attr("width", labelBBox.width + 8);

                    if (timeline.onYearHover && timeline.hoveredYear !== hoveredYear) {
                        timeline.hoveredYear = hoveredYear;
                        timeline.onYearHover(hoveredYear);
                    }

                    timeline.animationFrame = null;
                });
            })
            .on("mouseleave.highlight", function() {
                if (timeline.animationFrame) {
                    cancelAnimationFrame(timeline.animationFrame);
                    timeline.animationFrame = null;
                }
                if (timeline.isLocked) return;

                timeline.graceTimer = setTimeout(() => {
                    timeline.hairlineGroup.style("opacity", 0);
                    timeline.hoveredYear = null;
                    if (timeline.onYearHover) {
                        timeline.onYearHover(null);
                    }
                    timeline.graceTimer = null;
                }, 550);
            })
            .on("click.lock", function(event) {
                const brushSelection = d3.brushSelection(timeline.brushGroup.node());
                if (brushSelection) return;

                const [mouseX] = d3.pointer(event, this);
                let clickedYear = Math.round(timeline.xScale.invert(mouseX));
                const [minDomain, maxDomain] = timeline.xScale.domain();
                clickedYear = Math.max(minDomain, Math.min(maxDomain, clickedYear));

                if (timeline.isLocked && timeline.lockedYear === clickedYear) {
                    timeline.clearLock();
                } else {
                    timeline.lockYear(clickedYear);
                }
            })
            .on("dblclick.lock", function(event) {
                event.preventDefault();
                const [mouseX] = d3.pointer(event, this);
                let clickedYear = Math.round(timeline.xScale.invert(mouseX));
                const [minDomain, maxDomain] = timeline.xScale.domain();
                clickedYear = Math.max(minDomain, Math.min(maxDomain, clickedYear));

                if (timeline.isLocked && timeline.lockedYear === clickedYear) {
                    timeline.clearLock();
                } else {
                    timeline.lockYear(clickedYear);
                }
            });

        // Re-enable tooltips
        d3.select('#tooltip').classed('story-mode-hidden', false);

        // Clear story annotations and click handlers
        this.plotChart.clearStoryAnnotations();
        this.plotChart.clearClickableDotsForStory();

        // Resize visualization back to full width
        this.resizeVisualization(false);

        // Restore user's original state
        this.restoreState();

        this.currentStep = -1;
    }

    goToStep(stepIndex) {
        // Validate step index
        if (stepIndex < 0 || stepIndex >= this.storySteps.length) {
            this.endStory();
            return;
        }

        this.currentStep = stepIndex;
        const step = this.storySteps[stepIndex];

        // 1. Update story panel UI
        d3.select('#story-caption').html(step.caption);
        d3.select('#story-prev-btn').property('disabled', stepIndex === 0);

        // Handle "Next" button state
        if (stepIndex === this.storySteps.length - 1) {
            // Last step - change button text
            d3.select('#story-next-btn').text('End Story & Explore').property('disabled', false);
        } else {
            // Regular step
            d3.select('#story-next-btn').text('Next →').property('disabled', step.requireClickToAdvance);
        }

        // 2. Clear previous step's visual elements
        this.plotChart.clearStoryAnnotations();
        this.plotChart.clearClickableDotsForStory();

        // 3. Apply visualization changes
        const duration = 750;

        // Set timeline brush
        if (step.yearRange) {
            this.timeline.programmaticBrush(step.yearRange, duration);
        } else if (stepIndex === 0) {
            // Step 0: reset to full range
            this.timeline.programmaticBrush(null, duration);
        }

        // Set genre filter
        if (step.genres) {
            setTimeout(() => {
                this.plotChart.programmaticSetGenres(step.genres);
            }, duration / 2);
        }

        // 4. Add annotations and interactions after transitions complete
        setTimeout(() => {
            // Add annotations
            if (step.annotations && step.annotations.length > 0) {
                step.annotations.forEach(movieTitle => {
                    this.plotChart.addStoryAnnotation(movieTitle);
                });
            }

            // Make specific dots clickable if needed
            if (step.clickableMovies) {
                this.plotChart.makeDotsClickableForStory(step.clickableMovies, (movie) => {
                    console.log(`User clicked: ${movie.Series_Title}`);
                    // Advance to next step
                    this.goToStep(this.currentStep + 1);
                });
            }
        }, duration + 200);

        // Announce step change to screen readers
        const stepAnnouncer = document.getElementById('story-announcer');
        if (stepAnnouncer) {
            stepAnnouncer.textContent = `Step ${stepIndex + 1} of ${this.storySteps.length}`;
        }

        console.log(`Story step ${stepIndex}:`, step);
    }
}
