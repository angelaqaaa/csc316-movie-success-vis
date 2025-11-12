/**
 * StoryManager - Manages the 5-step guided narrative for the movie visualization
 * Implements the "Hybrid Stepper" (Martini Glass) narrative format
 * Author-driven phase → Reader-driven phase with state preservation
 */

class StoryManager {
    constructor(plotChart, timeline) {
        this.chart = plotChart;
        this.timeline = timeline;
        this.currentStep = -1; // Not started yet
        this.userState = null; // Captured state before story begins

        // Define the 5-step story arc: "Do Great Movies Make Great Money?"
        this.storySteps = [
            // Step 0: Welcome / Setting
            {
                title: "A Century of Cinema",
                caption: `Welcome to the story of commercial movie success! Over the past century, the relationship between
                         critical acclaim, audience love, and box office gold has constantly evolved. Let's explore this
                         journey together.<br><br><strong>Click Next to begin.</strong>`,
                actions: {
                    yearRange: null, // Show all years
                    genres: null, // Show all genres (null means all)
                    ratingSplit: 8.0,
                    ratingBands: ['high', 'low'],
                    annotations: [],
                    clickableDots: []
                },
                requiresClick: false
            },
            // Step 1: Golden Age (1930-1975)
            {
                title: "The Golden Age",
                caption: `Let's start with the "Golden Age" (1930-1975). In this era, many celebrated films were also
                         strong commercial performers. Movies like <em>The Godfather</em> exemplified this alignment—critical
                         darlings that also dominated the box office.<br><br><strong>Trend:</strong> Aligned`,
                actions: {
                    yearRange: [1930, 1975],
                    genres: null, // All genres
                    ratingSplit: 8.0,
                    ratingBands: ['high', 'low'],
                    annotations: [
                        { movieTitle: "The Godfather", text: "Classic", icon: "👑" }
                    ],
                    clickableDots: []
                },
                requiresClick: false
            },
            // Step 2: Blockbuster Era (1975-1985) - REQUIRES CLICK
            {
                title: "The Blockbuster is Born",
                caption: `In the 1970s, everything changed. The "Blockbuster" was born. Films like <em>Star Wars</em> (1977)
                         and <em>Jaws</em> (1975) shattered box office records, proving Action and Sci-Fi could be both
                         critical successes and commercial giants.<br><br>
                         <strong style="color: #e50914;">⚠️ Click the dot for "Star Wars" to continue.</strong>`,
                actions: {
                    yearRange: [1975, 1985],
                    genres: ['Action', 'Adventure', 'Sci-Fi'],
                    ratingSplit: 8.0,
                    ratingBands: ['high', 'low'],
                    annotations: [
                        { movieTitle: "Star Wars", text: "Phenomenon", icon: "⭐" },
                        { movieTitle: "Jaws", text: "Blockbuster", icon: "🦈" }
                    ],
                    clickableDots: ["Star Wars"]
                },
                requiresClick: true
            },
            // Step 3: Great Divergence (1990-2019) - REQUIRES CLICK
            {
                title: "The Great Divergence",
                caption: `In the modern era (1990-2019), two distinct success patterns emerged:<br><br>
                         <strong>"Critic-Proof Hits"</strong>: Loved by audiences and massive at the box office, but
                         with mixed critical reviews (e.g., <em>Star Wars: Episode VII</em>).<br><br>
                         <strong>"Acclaimed Gems"</strong>: Adored by critics and audiences alike, but with modest
                         box office returns (e.g., <em>The Shawshank Redemption</em>).<br><br>
                         <strong>Correlation:</strong> Weak<br><br>
                         <strong style="color: #e50914;">⚠️ Click either film to continue.</strong>`,
                actions: {
                    yearRange: [1990, 2019],
                    genres: null, // All genres
                    ratingSplit: 8.5, // Adjust threshold to highlight high-rated films
                    ratingBands: ['high', 'low'],
                    annotations: [
                        { movieTitle: "The Shawshank Redemption", text: "Acclaimed Gem", icon: "💎" },
                        { movieTitle: "Star Wars: Episode VII - The Force Awakens", text: "Blockbuster", icon: "💰" }
                    ],
                    clickableDots: ["The Shawshank Redemption", "Star Wars: Episode VII - The Force Awakens"]
                },
                requiresClick: true
            },
            // Step 4: Resolution / Your Turn
            {
                title: "Your Turn to Explore",
                caption: `Now you've seen the story. Critical acclaim, audience love, and box office gold form a complex tapestry.
                         <strong>The story is now yours to discover.</strong><br><br>
                         We've returned you to your original view. Use the timeline, genre filter, and rating slider to
                         explore patterns for yourself. What insights can you uncover?<br><br>
                         <em>Happy exploring!</em>`,
                actions: {
                    // This step will restore user's original state
                    restore: true
                },
                requiresClick: false
            }
        ];

        // Bind methods to preserve 'this' context
        this.init = this.init.bind(this);
        this.startStory = this.startStory.bind(this);
        this.endStory = this.endStory.bind(this);
        this.goToStep = this.goToStep.bind(this);
        this.handleNext = this.handleNext.bind(this);
        this.handlePrevious = this.handlePrevious.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
        this.snapshotState = this.snapshotState.bind(this);
        this.restoreState = this.restoreState.bind(this);
    }

    /**
     * Initialize Story Mode UI event handlers
     * Call this after DOM is ready
     */
    init() {
        const storyButton = d3.select("#start-story-btn");
        const exitButton = d3.select("#story-exit-btn");
        const nextButton = d3.select("#story-next-btn");
        const prevButton = d3.select("#story-prev-btn");

        if (storyButton.empty()) {
            console.warn("Story Mode button not found. Make sure HTML is updated.");
            return;
        }

        // Button event handlers
        storyButton.on("click", this.startStory);
        exitButton.on("click", this.endStory);
        nextButton.on("click", this.handleNext);
        prevButton.on("click", this.handlePrevious);

        // Progress dot navigation
        d3.selectAll(".story-progress-dot").on("click", (event, d, i, nodes) => {
            const dotIndex = Array.from(nodes).indexOf(event.currentTarget);
            if (dotIndex >= 0 && dotIndex < this.storySteps.length) {
                this.goToStep(dotIndex);
            }
        });

        // Keyboard navigation (only when story panel is visible)
        document.addEventListener("keydown", this.handleKeydown);

        console.log("Story Mode initialized");
    }

    /**
     * Capture current application state before story begins
     */
    snapshotState() {
        this.userState = this.chart.getAppSnapshot();
        console.log("User state captured:", this.userState);
    }

    /**
     * Restore previously captured application state
     */
    restoreState() {
        if (this.userState) {
            console.log("Restoring user state:", this.userState);
            this.chart.restoreAppSnapshot(this.userState);

            // Also pulse UI controls to encourage exploration
            this.pulseControls();
        }
    }

    /**
     * Pulse UI controls to draw attention after story ends
     */
    pulseControls() {
        // Pulse genre dropdown and timeline briefly
        const genreButton = d3.select("#genreDropdownButton");
        const resetButton = d3.select("#reset-filters");

        [genreButton, resetButton].forEach(element => {
            if (!element.empty()) {
                element
                    .transition().duration(200).style("transform", "scale(1.05)")
                    .transition().duration(200).style("transform", "scale(1)")
                    .transition().duration(200).style("transform", "scale(1.05)")
                    .transition().duration(200).style("transform", "scale(1)");
            }
        });
    }

    /**
     * Start Story Mode
     */
    startStory() {
        // Capture user's current state
        this.snapshotState();

        // Show story panel and hide story button
        d3.select("#story-panel").style("display", "block")
            .style("opacity", 0)
            .transition().duration(300).style("opacity", 1);

        d3.select("#story-backdrop").style("display", "block")
            .style("opacity", 0)
            .transition().duration(300).style("opacity", 1);

        d3.select("#start-story-btn").style("display", "none");

        // Disable exploratory controls
        this.chart.disableInteractions();
        this.timeline.disableInteractions();

        d3.select("#genreDropdownButton").style("pointer-events", "none").style("opacity", 0.5);
        d3.select("#reset-filters").style("pointer-events", "none").style("opacity", 0.5);
        d3.select("#reset-timeline").style("pointer-events", "none").style("opacity", 0.5);

        // Start at step 0
        this.goToStep(0);

        // Announce to screen readers
        this.announce("Story mode started. Use arrow keys or next button to navigate.");

        console.log("Story Mode started");
    }

    /**
     * End Story Mode and restore user state
     */
    endStory() {
        // Clear story-specific visuals
        this.chart.clearStoryAnnotations();

        // Hide story panel
        d3.select("#story-panel")
            .transition().duration(300).style("opacity", 0)
            .on("end", () => d3.select("#story-panel").style("display", "none"));

        d3.select("#story-backdrop")
            .transition().duration(300).style("opacity", 0)
            .on("end", () => d3.select("#story-backdrop").style("display", "none"));

        d3.select("#start-story-btn").style("display", "inline-block");

        // Re-enable controls
        this.chart.enableInteractions();
        this.timeline.enableInteractions();

        d3.select("#genreDropdownButton").style("pointer-events", "auto").style("opacity", 1);
        d3.select("#reset-filters").style("pointer-events", "auto").style("opacity", 1);
        d3.select("#reset-timeline").style("pointer-events", "auto").style("opacity", 1);

        // Restore user's original state
        this.restoreState();

        this.currentStep = -1;

        // Announce to screen readers
        this.announce("Story mode ended. Original view restored.");

        console.log("Story Mode ended");
    }

    /**
     * Navigate to a specific story step
     * @param {number} stepIndex - Step index (0-4)
     */
    goToStep(stepIndex) {
        if (stepIndex < 0 || stepIndex >= this.storySteps.length) {
            console.warn(`Invalid step index: ${stepIndex}`);
            return;
        }

        this.currentStep = stepIndex;
        const step = this.storySteps[stepIndex];

        console.log(`Navigating to step ${stepIndex}: ${step.title}`);

        // Clear previous step's story elements
        this.chart.clearStoryAnnotations();

        // Update story panel UI
        d3.select("#story-title").html(step.title);
        d3.select("#story-caption").html(step.caption);

        // Update navigation buttons
        d3.select("#story-prev-btn")
            .property("disabled", stepIndex === 0)
            .style("opacity", stepIndex === 0 ? 0.4 : 1);

        d3.select("#story-next-btn")
            .property("disabled", step.requiresClick) // Disable if click required
            .style("opacity", step.requiresClick ? 0.4 : 1)
            .html(stepIndex === this.storySteps.length - 1 ? "Finish" : "Next →");

        // Update progress dots
        d3.selectAll(".story-progress-dot").each(function(d, i) {
            d3.select(this).classed("active", i === stepIndex);
        });

        // Apply story step actions
        this.applyStepActions(step);

        // Announce to screen readers
        this.announce(`Step ${stepIndex + 1} of ${this.storySteps.length}: ${step.title}. ${step.caption.replace(/<[^>]*>/g, '')}`);
    }

    /**
     * Apply visual and filter changes for a story step
     * @param {Object} step - Story step configuration
     */
    applyStepActions(step) {
        const actions = step.actions;

        // Special case: Step 4 restores state
        if (actions.restore) {
            setTimeout(() => this.restoreState(), 400);
            return;
        }

        // Apply year range filter
        if (actions.yearRange !== undefined) {
            this.chart.setYearRange(actions.yearRange);
        }

        // Apply genre filter
        if (actions.genres !== undefined) {
            if (actions.genres === null) {
                // All genres
                this.chart.setSelectedGenres(this.chart.genres);
            } else {
                this.chart.setSelectedGenres(actions.genres);
            }
        }

        // Apply rating split threshold
        if (actions.ratingSplit !== undefined) {
            this.chart.setRatingSplit(actions.ratingSplit);
        }

        // Apply visible rating bands
        if (actions.ratingBands !== undefined) {
            this.chart.setVisibleRatingBands(actions.ratingBands);
        }

        // Wait for transitions to complete before adding annotations
        setTimeout(() => {
            // Add annotations
            if (actions.annotations && actions.annotations.length > 0) {
                actions.annotations.forEach(ann => {
                    this.chart.addAnnotation(ann.movieTitle, ann.text, ann.icon);
                });
            }

            // Set up clickable dots
            if (actions.clickableDots && actions.clickableDots.length > 0) {
                this.makeDotsClickable(actions.clickableDots);
            }
        }, 800); // Wait for brush animation + data update
    }

    /**
     * Make specific dots clickable to advance story
     * @param {Array} movieTitles - Array of movie titles to make clickable
     */
    makeDotsClickable(movieTitles) {
        const vis = this;

        // Reset all dots first
        this.chart.chartArea.selectAll(".dot")
            .classed("story-dot-clickable", false)
            .style("cursor", null)
            .on("click.story", null)
            .attr("tabindex", null);

        // Make specified dots clickable
        this.chart.chartArea.selectAll(".dot")
            .filter(d => movieTitles.includes(d.Series_Title))
            .classed("story-dot-clickable", true)
            .style("cursor", "pointer")
            .attr("tabindex", "0")
            .on("click.story", function(event, d) {
                console.log(`Clicked story dot: ${d.Series_Title}`);
                vis.handleNext(); // Advance to next step
            })
            .on("keydown", function(event, d) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    console.log(`Activated story dot via keyboard: ${d.Series_Title}`);
                    vis.handleNext();
                }
            });
    }

    /**
     * Handle Next button click
     */
    handleNext() {
        const currentStep = this.storySteps[this.currentStep];

        // If on the last step, end story
        if (this.currentStep === this.storySteps.length - 1) {
            this.endStory();
        } else {
            // Check if current step requires click and Next button is disabled
            if (currentStep && currentStep.requiresClick) {
                // User clicked a dot, so enable next and advance
                d3.select("#story-next-btn").property("disabled", false).style("opacity", 1);
            }
            this.goToStep(this.currentStep + 1);
        }
    }

    /**
     * Handle Previous button click
     */
    handlePrevious() {
        if (this.currentStep > 0) {
            this.goToStep(this.currentStep - 1);
        }
    }

    /**
     * Handle keyboard navigation
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeydown(event) {
        // Only handle if story panel is visible
        const panelVisible = d3.select("#story-panel").style("display") !== "none";
        if (!panelVisible) return;

        switch (event.key) {
            case "ArrowRight":
                if (!this.storySteps[this.currentStep]?.requiresClick) {
                    this.handleNext();
                    event.preventDefault();
                }
                break;
            case "ArrowLeft":
                this.handlePrevious();
                event.preventDefault();
                break;
            case "Escape":
                this.endStory();
                event.preventDefault();
                break;
        }
    }

    /**
     * Announce message to screen readers via ARIA live region
     * @param {string} message - Message to announce
     */
    announce(message) {
        const liveRegion = d3.select("#story-live-region");
        if (!liveRegion.empty()) {
            liveRegion.text(message);
        }
    }
}
