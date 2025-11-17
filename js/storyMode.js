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
                caption: "Welcome! This chart shows 830 top-rated movies by their release year (left-to-right) and box office gross (bottom-to-top). Let's see how this relationship has changed.",
                mascotEmoji: "🎟️",
                yearRange: null, // Show all years
                genres: 'All',
                annotations: [],
                clickableMovies: null,
                requireClickToAdvance: false
            },
            { // Step 1: Golden Age (1930-1975)
                caption: `First, let's look at the 'Golden Age' (1930-1975). In this era, many celebrated films were also strong earners for their time. <span class="story-badge">Evidence: Trend Aligned</span>`,
                mascotEmoji: "🎬",
                yearRange: [1930, 1975],
                genres: 'All',
                annotations: ["The Godfather"],
                clickableMovies: null,
                requireClickToAdvance: false
            },
            { // Step 2: The Blockbuster Era (1975-1985)
                caption: `The 1970s created the 'Blockbuster.' Suddenly, 'Action' and 'Sci-Fi' films could dominate. <strong>Click the pulsing dot for <em>Star Wars</em> to see what happened.</strong>`,
                mascotEmoji: "🦈",
                yearRange: [1975, 1985],
                genres: ['Action', 'Sci-Fi', 'Adventure', 'Thriller'],  // Widened to include Jaws (Adventure, Thriller)
                annotations: ["Star Wars"],  // Only Star Wars gets visual highlighting
                clickableMovies: ["Star Wars"],  // Only 1977 Star Wars is clickable
                requireClickToAdvance: true
            },
            { // Step 3: The Great Divergence (1990-2019)
                caption: `In the modern era (1990-2019), success split. We now have 'Critic-Proof Hits' (high gross, lower ratings) and 'Acclaimed Gems' (high ratings, low gross). <strong>Click either highlighted film to continue.</strong> <span class="story-badge">Evidence: Correlation Weak</span>`,
                mascotEmoji: "🎭",
                yearRange: [1990, 2019],
                genres: 'All',
                annotations: ["The Shawshank Redemption", "Star Wars: Episode VII - The Force Awakens"],
                clickableMovies: ["The Shawshank Redemption", "Star Wars: Episode VII - The Force Awakens"],
                requireClickToAdvance: true
            },
            { // Step 4: Your Turn
                caption: `You've seen the story of the critic-audience split. The dashboard is now unlocked for free exploration. When you're ready, end the story to begin.`,
                mascotEmoji: "🧭",
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

    /**
     * Enable the Next button (used by Matryoshka interaction)
     */
    enableNextButton() {
        d3.select('#story-next-btn').property('disabled', false);
        console.log("Next button enabled");
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
        // No longer need to resize for side panel - story panel now replaces header
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

        // Hide header elements (Replacement Model)
        d3.select('.header-section').style('display', 'none');
        d3.select('.instructions').style('display', 'none');
        d3.select('.filter-bar').style('display', 'none');

        // Show story panel and apply layout changes
        d3.select('body').classed('story-mode-active', true);
        d3.select('#story-panel').style('display', 'block');
        d3.select('#start-story-btn').style('display', 'none');

        // No overlay needed - story panel replaces header

        // Note: According to spec, zoom/pan should remain ENABLED during story mode
        // Only disable timeline brush and filter controls
        // this.plotChart.disableZoomPan(); // Keep zoom/pan enabled per spec
        this.timeline.disableBrush();

        // Disable reset timeline button (both mouse and keyboard)
        d3.select('#reset-timeline')
            .property('disabled', true)
            .style('cursor', 'not-allowed')
            .style('opacity', '0.5')
            .attr('tabindex', '-1');

        // Disable reset legend button
        d3.select('.reset-legend-btn')
            .style('cursor', 'not-allowed')
            .style('opacity', '0.5')
            .on('click', null)
            .on('keydown', null)
            .attr('tabindex', '-1');

        // Disable ALL legend interactions (rating split slider + band toggles)
        d3.selectAll('.legend-item')
            .style('cursor', 'not-allowed')
            .style('opacity', '0.5')
            .on('click', null)     // Remove click handlers
            .on('keydown', null);  // Remove keyboard handlers

        // Disable rating threshold slider
        d3.select('#rating-threshold-slider')
            .property('disabled', true)
            .style('cursor', 'not-allowed')
            .style('opacity', '0.5');

        // Disable timeline lock interactions only (keep hover for cross-view highlighting)
        // Per spec: cross-view hover should remain enabled
        // this.timeline.svg.on('mousemove.highlight', null);  // Keep enabled
        // this.timeline.svg.on('mouseleave.highlight', null); // Keep enabled
        this.timeline.svg.on('click.lock', null);
        this.timeline.svg.on('dblclick.lock', null);

        // Keep dot hover highlighting enabled for cross-view hover
        // Per spec: hovering should work during story mode
        // this.plotChart.chartArea.selectAll('.dot')
        //     .on('mouseover', null)
        //     .on('mouseout', null)
        //     .on('focus', null)
        //     .on('blur', null);

        // User wants tooltips visible in story mode
        // d3.select('#tooltip').classed('story-mode-hidden', true);

        // Resize visualization to make space for panel
        this.resizeVisualization(true);

        // Start at step 0
        this.goToStep(0);
    }

    endStory() {
        // Reset story mode flags (re-enable interactive handlers)
        this.plotChart.isStoryModeActive = false;
        this.timeline.isStoryModeActive = false;

        // Clear any stuck transition flags
        this.plotChart.useTransition = false;
        this.plotChart.transitionDuration = 0;
        this.timeline.programmaticDuration = 0;

        // Clear any timeline lock state from story mode
        if (this.timeline.isLocked) {
            this.timeline.clearLock();
        }

        // Reset axes to use correct scales (fix for stuck x-axis after story mode)
        // This ensures the axis generators are not using stale transformed scales
        this.plotChart.xAxis.scale(this.plotChart.xScale);
        this.plotChart.yAxis.scale(this.plotChart.yScale);

        // Force a chart update to ensure axes are responsive
        this.plotChart.wrangleData();

        // Restore header elements (Replacement Model)
        d3.select('.header-section').style('display', null);
        d3.select('.instructions').style('display', null);
        d3.select('.filter-bar').style('display', null);

        // Remove story panel
        d3.select('body').classed('story-mode-active', false);
        d3.select('#story-panel').style('display', 'none');
        d3.select('#start-story-btn').style('display', 'inline-block');

        // Re-enable interactive controls
        // zoom/pan was never disabled (per spec)
        this.timeline.enableBrush();
        d3.select('#genreDropdownButton').property('disabled', false);
        d3.select('#reset-filters').property('disabled', false);

        // Re-enable reset timeline button
        d3.select('#reset-timeline')
            .property('disabled', false)
            .style('cursor', null)
            .style('opacity', null)
            .attr('tabindex', null);

        // Re-enable reset legend button
        const plotChart = this.plotChart;
        d3.select('.reset-legend-btn')
            .style('cursor', null)
            .style('opacity', null)
            .on('click', function() {
                plotChart.resetLegend();
            })
            .on('keydown', function(event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    plotChart.resetLegend();
                }
            })
            .attr('tabindex', null);

        // Re-enable legend interactions (slider + band toggles)
        d3.selectAll('.legend-item')
            .style('cursor', null)
            .style('opacity', null)
            .on('click', function(event, d) {
                plotChart.toggleRatingBand(d.id);
            })
            .on('keydown', function(event, d) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    plotChart.toggleRatingBand(d.id);
                }
            });

        // Re-enable rating threshold slider
        d3.select('#rating-threshold-slider')
            .property('disabled', false)
            .style('cursor', null)
            .style('opacity', null);

        // Re-enable timeline click interactions that were disabled during story mode
        // NOTE: mousemove/mouseleave handlers were never removed, so don't re-attach them
        // Only re-attach click.lock and dblclick.lock which were removed in startStory()
        const timeline = this.timeline;
        timeline.svg
            .on("click.lock", function(event) {
                // Disable click-to-lock during story mode (but hover still works)
                if (timeline.isStoryModeActive) return;

                // Ignore click if brushing (avoid conflicts)
                const brushSelection = d3.brushSelection(timeline.brushGroup.node());
                if (brushSelection) return;

                const [mouseX] = d3.pointer(event, this);
                let clickedYear = Math.round(timeline.xScale.invert(mouseX));

                // Clamp year to scale domain
                const [minDomain, maxDomain] = timeline.xScale.domain();
                clickedYear = Math.max(minDomain, Math.min(maxDomain, clickedYear));

                // Toggle lock state
                if (timeline.isLocked && timeline.lockedYear === clickedYear) {
                    // Unlock: clicking the same year again
                    timeline.clearLock();
                } else {
                    // Lock: new year or first lock
                    timeline.lockYear(clickedYear);
                }
            })
            .on("dblclick.lock", function(event) {
                // Disable double-click-to-lock during story mode (but hover still works)
                if (timeline.isStoryModeActive) return;

                // Double-click to lock works even when brush is active
                // This allows locking a year when brushed (since single click is used for brush)
                event.preventDefault(); // Prevent default double-click behavior

                const [mouseX] = d3.pointer(event, this);
                let clickedYear = Math.round(timeline.xScale.invert(mouseX));

                // Clamp year to scale domain
                const [minDomain, maxDomain] = timeline.xScale.domain();
                clickedYear = Math.max(minDomain, Math.min(maxDomain, clickedYear));

                // Toggle lock state
                if (timeline.isLocked && timeline.lockedYear === clickedYear) {
                    // Unlock: double-clicking the same year again
                    timeline.clearLock();
                } else {
                    // Lock: new year or first lock
                    timeline.lockYear(clickedYear);
                }
            });

        // Tooltips always visible now
        // d3.select('#tooltip').classed('story-mode-hidden', false);

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

        // Clear context-click artifacts from previous step (if any)
        this.plotChart.clearContextClick();

        this.currentStep = stepIndex;
        const step = this.storySteps[stepIndex];

        // 1. Update story panel UI
        d3.select('#story-text').html(step.caption);
        d3.select('#story-prev-btn').property('disabled', stepIndex === 0);

        // Update progress dots
        d3.selectAll('.story-progress-dot')
            .classed('active', false)
            .filter((d, i) => i === stepIndex)
            .classed('active', true);

        // Update step indicator in headline
        d3.select('.story-headline').attr('data-step', `STEP ${stepIndex + 1}`);

        // Update mascot emoji based on step
        d3.select('.story-mascot').text(step.mascotEmoji || '🎬');

        // Handle "Next" button state
        if (stepIndex === this.storySteps.length - 1) {
            // Last step - disable Next button like we do with Back at step 0
            d3.select('#story-next-btn').text('Next →').property('disabled', true);
        } else {
            // Regular step - disable Next if requireClickToAdvance is true
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
            // Add annotations (but skip movies that are clickable - they'll get different styling)
            if (step.annotations && step.annotations.length > 0) {
                const clickableMoviesList = step.clickableMovies || [];
                step.annotations.forEach(movieTitle => {
                    // Only add gold annotation styling to non-clickable movies
                    if (!clickableMoviesList.includes(movieTitle)) {
                        this.plotChart.addStoryAnnotation(movieTitle);
                    }
                });
            }

            // Make specific dots clickable if needed
            if (step.clickableMovies) {
                // Pass a reference to this StoryManager for the callback
                const storyManager = this;
                this.plotChart.makeDotsClickableForStory(step.clickableMovies, function(movie) {
                    console.log(`User clicked: ${movie.Series_Title}`);

                    // Show context-click insight for this movie
                    storyManager.plotChart.showContextClick(movie);

                    // Enable Next button
                    storyManager.enableNextButton();

                    // Do NOT auto-advance - user must click Next button
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
