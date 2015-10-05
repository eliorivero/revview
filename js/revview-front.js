/**
 * Revview - Revision Selection Timeline
 */

var WP_API_Settings, wp, TimeStampedMixin, HierarchicalMixin, revview;

(function ( $ ) {

	'use strict';

	/**
	 * Backbone model for public revisions
	 */
	revview.RevisionModel = wp.api.models.Revision.extend( _.extend(
		/** @lends Revision.prototype */
		{
			/**
			 * Set nonce header before every Backbone sync
			 *
			 * @param {string} method
			 * @param {Backbone.Model} model
			 * @param {{beforeSend}, *} options
			 * @returns {*}
			 */
			sync: function( method, model, options ) {
				options = options || {};

				if ( 'undefined' !== typeof WP_API_Settings.nonce ) {
					var beforeSend = options.beforeSend;

					options.beforeSend = function( xhr ) {
						xhr.setRequestHeader( 'X-WP-Nonce', WP_API_Settings.nonce );
						xhr.setRequestHeader( 'X-WP-Revview-Styles', revview.styles );
						xhr.setRequestHeader( 'X-WP-Revview-Scripts', revview.scripts );

						if ( beforeSend ) {
							return beforeSend.apply( this, arguments );
						}
					};
				}

				return Backbone.sync( method, model, options );
			},

			/**
			 * Return URL for the model
			 *
			 * @returns {string}
			 */
			url: function() {
				var id = this.get( 'id' ) || '';
				return WP_API_Settings.root + 'revview/v1/posts/' + revview.post_id + '/revisions/' + id;
			},

			defaults: _.extend( {},
				wp.api.models.Revision.prototype.defaults,
				{
					author_name: '',
					loaded: false
				}
			)

		}, TimeStampedMixin, HierarchicalMixin )
	);

	/**
	 * Backbone public revisions collection
	 */
	revview.RevisionList = wp.api.collections.Revisions.extend(
		/** @lends Revisions.prototype */
		{
			model: revview.RevisionModel,

			/**
			 * return URL for collection
			 *
			 * @returns {string}
			 */
			url: function() {
				var id = this.get( 'id' ) || revview.post_id;
				return WP_API_Settings.root + 'revview/v1/posts/' + id + '/revisions/ids';
			},

			/**
			 * Looks for a revision in the collection first by index.
			 * @param index
			 */
			getRevision: function( index ) {
				var self = this,
					found = self.at( index );

				if ( _.isObject( found ) && found.get( 'loaded' ) ) {
					self.trigger( 'change', found );
					return;
				}

				var newRevision = new revview.RevisionModel( {
					id: self.at( index ).get( 'id' )
				});

				newRevision.fetch({
					success: function( model ) {
						self.remove( self.at( index ) );

						model.set( 'loaded', true );
						self.add( model, { at: index, merge: true } );

						self.trigger( 'change', model );
					}
				});
			}
		}
	);

	/**
	 * Backbone Model for the information about currently displayed revision.
	 */
	revview.RevisionInfoModel = Backbone.Model.extend({
		defaults: {
			author_name: '',
			date: ''
		}
	});

	/**
	 * Backbone View for the tooltips with information about revision.
	 */
	revview.RevisionInfoView = Backbone.View.extend({
		className: 'revview-info',

		template: wp.template( 'revview-info' ),

		initialize: function() {
			this.listenTo( this.model, 'change', this.render );
		},

		render: function(){
			this.$el.empty();
			this.$el.append( this.template( this.model.toJSON() ) );
			return this;
		}
	});

	/**
	 * Backbone Model for the tooltips with information about revision.
	 */
	revview.RevisionTooltipModel = Backbone.Model.extend({
		defaults: {
			display: {
				author_name: '',
				date: ''
			},
			mouseX: 0,
			visible: false
		}
	});

	/**
	 * Backbone View for the tooltips with information about revision.
	 */
	revview.RevisionTooltipView = revview.RevisionInfoView.extend({
		className: 'revview-tooltip',

		template: wp.template( 'revview-tooltip' ),

		selectionBar: {
			width: 0,
			leftOffset: 0
		},

		initialize: function() {
			this.listenTo( this.model, 'change:display', this.render );
			this.listenTo( this.model, 'change:mouseX', this.updatePosition );
			this.listenTo( this.model, 'change:visible', this.updateVisibility );
			this.$el.hide();
		},

		updatePosition: function() {
			var tooltipX = this.model.get( 'mouseX' ),
				tooltipWidth = this.$el.outerWidth(),
				tooltipDetect = tooltipX,
				selectionBar = this.selectionBar,
				detectLeft = selectionBar.leftOffset + ( tooltipWidth / 4 ),
				detectRight = selectionBar.leftOffset + selectionBar.width - ( tooltipWidth / 2 );

			// Left edge
			if ( detectLeft >= tooltipDetect ) {
				if ( ! this.$el.hasClass( 'revview-tooltip-left' ) ) {
					this.$el.addClass( 'revview-tooltip-left' ).removeClass( 'revview-tooltip-right' );
				}
			} else {
				this.$el.removeClass( 'revview-tooltip-left' );
			}

			// Right edge
			if ( detectRight <= tooltipDetect ) {
				if ( ! this.$el.hasClass( 'revview-tooltip-right' ) ) {
					this.$el.addClass( 'revview-tooltip-right' ).removeClass( 'revview-tooltip-left' );
				}
			} else {
				this.$el.removeClass( 'revview-tooltip-right' );
			}

			this.$el.css( 'left', tooltipX + 'px' );
		},

		updateVisibility: function() {
			if ( this.model.get( 'visible' ) ) {
				this.$el.show();
			} else {
				this.$el.hide();
			}
		}
	});

	/**
	 * Backbone Model for revision selector bar.
	 */
	revview.RevisionSelectorModel = Backbone.Model.extend({
		defaults: {
			value: null,
			values: null,
			min: 0,
			max: 1,
			step: 1,
			range: false,
			currentRevision: 0
		}
	});

	/**
	 * Backbone View for single revision selector.
	 */
	revview.RevisionSelectorView = Backbone.View.extend( {
		events: {
			'mousemove' : 'mouseMove',
			'mouseleave' : 'mouseLeave',
			'mouseenter' : 'mouseEnter'
		},

		currentRevisionIndex: 0,

		initialize: function( args ) {
			this.tooltip = args.tooltip;
			this.app = args.app;

			_.bindAll( this, 'stop', 'mouseMove', 'mouseLeave', 'mouseEnter', 'refreshBarOffset' );

			this.refreshTooltip = _.throttle( this.refreshTooltip, 150 );

			// Update selection bar offset
			this.refreshBarOffset = _.debounce( this.refreshBarOffset, 150 );
			$(window).on( 'resize', this.refreshBarOffset );
		},

		/**
		 * For all revision models, format the date & time according to date & time specified in WP Admin > Settings.
		 * Render revision selector bar adding tick marks.
		 *
		 * @returns {revview.RevisionSelectorView}
		 */
		render: function() {
			this.selectorRevisions = _.each( this.model.get( 'revisions' ).invoke( 'pick', [ 'author_name', 'date' ] ), function( revision ) {
				revision.date = revviewDate( revview.datetime_format, revision.date );
			});

			// Revision selection bar
			this.model.set( 'max', this.model.get( 'revisions' ).length - 1 );
			this.$el.slider( _.extend( this.model.toJSON(), {
				stop: this.stop
			}) );

			// Tick marks
			var max = this.model.get( 'max' ),
				spacing = 100 / max;
			for ( var i = 0; i <= max; i++ ) {
				$( '<span class="revview-tick"></span>' ).css( 'left', ( spacing * i ) +  '%' ).appendTo( this.$el );
			}

			this.refreshBarOffset();

			return this;
		},

		/**
		 * Update revision reference and information to be displayed.
		 *
		 * @param { number } index
		 */
		selectRevision: function( index ) {
			this.app.model.set( 'currentRevision', index );
			this.app.model.set( 'currentInfo', this.selectorRevisions[index] );
		},

		/**
		 * User stopped dragging the slider handle or clicked on the selection bar.
		 *
		 * @param { object } e
		 * @param where
		 */
		stop: function( e, where ) {
			this.selectRevision( where.value );
		},

		mouseMove: function( e ) {
			var revisionsLength = this.model.get( 'revisions' ).length,
				zoneCount       = revisionsLength - 1, // One fewer zone than models
				sliderFrom      = this.offset( this.$el ), // "From" edge of slider
				sliderWidth     = this.$el.width(), // Width of slider
				tickWidth       = sliderWidth / zoneCount, // Calculated width of zone
				actualX         = e.pageX - sliderFrom; // Flipped for RTL - sliderFrom;

			this.currentRevisionIndex = Math.floor( ( actualX  + ( tickWidth / 2 )  ) / tickWidth ); // Calculate the model index

			// Ensure sane value for this.currentRevisionIndex.
			if ( this.currentRevisionIndex < 0 ) {
				this.currentRevisionIndex = 0;
			} else if ( this.currentRevisionIndex >= revisionsLength ) {
				this.currentRevisionIndex = revisionsLength - 1;
			}

			// Move tooltip
			this.tooltip.model.set( 'mouseX', actualX );

			// Refresh tooltip with new info
			this.refreshTooltip();
		},

		offset: function( $obj ) {
			var offset = $obj.offset();
			return $(window).width()  - offset.left - $obj.outerWidth();
		},

		mouseEnter: function() {
			this.tooltip.model.set( 'visible', true );
		},

		mouseLeave: function() {
			this.tooltip.model.set( 'visible', false );
		},

		/**
		 * Update mouse position above selection bar in tooltip model.
		 */
		refreshTooltip: function() {
			this.tooltip.model.set( 'display', this.selectorRevisions[this.currentRevisionIndex] );
		},

		/**
		 * Update left offset and width of selection bar in tooltip model.
		 */
		refreshBarOffset: function() {
			this.tooltip.selectionBar = {
				'width': this.$el.outerWidth(),
				'leftOffset': this.$el.offset().left
			};
			this.tooltip.model.trigger( 'change:mouseX' );
		}

	} );

	revview.RevisionAppModel = Backbone.Model.extend({
		defaults: {
			currentRevision: 0,
			currentInfo: {}
		}
	});

	/**
	 * Backbone View for interface to select revisions.
	 */
	revview.RevisionApp = Backbone.View.extend({
		id: 'revview',

		className: 'revview-off', // starts hidden

		template: wp.template( 'revview-app' ),

		events: {
			'click .revview-stop' : 'stopRevisions',
			'update'              : 'hideLoading'
		},

		$iframe: null,
		$stage: null,
		revisionURL: '',

		initialize: function() {
			// Revision tooltip
			this.revisionTooltip = new revview.RevisionTooltipView({
				model: RevisionTooltip
			});

			// Current revision information
			this.revisionInfo = new revview.RevisionInfoView({
				model: RevisionInfo
			});

			// Revision selector
			this.revisionSelector = new revview.RevisionSelectorView({
				model: RevisionSelector,
				tooltip: this.revisionTooltip,
				app: this
			});

			this.listenTo( this.collection, 'request', this.showLoading );
			this.listenTo( this.model, 'change:currentRevision', this.changeRevision );
			this.listenTo( this.collection, 'change', this.placeRevision );
			this.listenToOnce( this.collection, 'sync', this.firstSync );

			_.bindAll( this, 'renderAreaLoaded', 'requestPage', 'requestPageSuccess' );

			window.addEventListener( 'message', this.renderAreaLoaded, false) ;

			var $body = $( 'body' );

			// Clean all classes from html tag since they're not needed and add ours
			$('html' ).removeClass().addClass( 'revview-ui' );

			// Add revision UI to page
			$body.append( this.render().$el );

			// Save reference to stage and iframe
			this.$stage = $( '#revview-stage' );
			this.$iframe = document.getElementById( 'revview-render' ).contentWindow.document;

			// Change URL for iframe
			this.revisionURL = document.location.href.replace( 'revview=enabled', 'revview=render' );

			this.startRevisions();
		},

		/**
		 * Called by button to view revisions.
		 */
		startRevisions: function() {
			this.showUI();
			this.renderAreaInit();
			this.collection.fetch();
		},

		/**
		 * Restores original title, content and excerpt.
		 */
		stopRevisions: function() {
			this.hideUI();
			history.back();
		},

		/**
		 * Render revision selector.
		 *
		 * @returns {revview.RevisionApp}
		 */
		render: function() {
			this.$el.append( this.template() );
			return this;
		},

		loadLastRevision: function( index ) {
			this.model.set( 'currentRevision', index );
			this.model.set( 'currentInfo', this.revisionSelector.selectorRevisions[index] );
			this.model.trigger( 'change:currentRevision' );

			// Focus handle so user can use previous/next keyboard arrows to go through the revisions.
			this.$el.find( '.ui-slider-handle' ).focus();
		},

		/**
		 * Fired when the revision index changes. Will fetch the selected revision if the full data is not in collection.
		 */
		changeRevision: function() {
			this.showLoading();
			this.collection.getRevision( this.model.get( 'currentRevision' ) );
		},

		/**
		 * Revision UI has been initialized and iframe loaded.
		 * Save reference to iframe elements.
		 * Display last revision information.
		 */
		renderAreaInit: function() {
			this.requestPage( {} );
		},

		/**
		 * Fire page request.
		 *
		 * @param { object } model
		 */
		requestPage: function( model ) {
			var query = {
					type     : 'POST',
					xhrFields: {
						withCredentials: true
					},
					success: this.requestPageSuccess
				};
			if ( ! _.isEmpty( model ) ) {
				query.data = _.pick( model.toJSON(), 'title', 'content', 'excerpt' )
			}

			$.ajax(
				this.revisionURL,
				query
			);
		},

		/**
		 * If request ended up ok, receive page HTML and insert it in iframe.
		 *
		 * @param { string } response
		 */
		requestPageSuccess: function( response ) {
			this.$iframe.open();
			this.$iframe.write( response );
			this.$iframe.close();
		},

		/**
		 * Receives iframe's window onload event and tells the app to update.
		 *
		 * @param { object } e
		 */
		renderAreaLoaded: function( e ) {
			if ( e.origin == document.origin ) {
				if ( e.data == 'revview-synced' ) {
					this.$el.trigger( 'update' );
				}
			}
		},

		/**
		 * Load selected revision.
		 * Updates displayed revision information.
		 *
		 * @param { Object } model
		 */
		placeRevision: function( model ) {
			this.requestPage( model );

			// Update revision information display
			this.refreshInfo( this.model.get( 'currentInfo' ) );

			// Load styles and scripts
			this.listAssets( model.get( 'assets' ) );
		},

		/**
		 * Initializes UI preparing revision selector list with author name and date, adds UI to page and loads the latest revision saved.
		 *
		 * @param { Object } collection
		 */
		firstSync: function( collection ) {
			if ( collection.length > 0 ) {
				// Load collection with only author name and date
				this.revisionSelector.model.set( 'revisions', collection );

				// Add UI elements
				this.$el.prepend( $('<div class="revview-revision-list" />').append( [this.revisionTooltip.render().el, this.revisionSelector.render().el, this.revisionInfo.render().el] ) );

				// Same than current content
				this.loadLastRevision( 0 );
			}
		},

		/**
		 * Set current revision information to be displayed.
		 *
		 * @param { object } currentInfo
		 */
		refreshInfo: function( currentInfo ) {
			if ( !_.isUndefined( currentInfo ) ) {
				this.revisionInfo.model.set( currentInfo );
			}
		},

		/**
		 * Parses information returned for styles and scripts.
		 *
		 * @param { object } response
		 */
		listAssets: function( response ) {

			// Check for and parse our response.
			if ( _.isEmpty( response ) || _.isUndefined( response ) ) {
				return;
			}

			// If additional scripts are required by the revision, parse them
			if ( _.isObject( response.scripts ) ) {
				// Count scripts that will be loaded
				_.each( response.scripts, function( required ) {
					// Add script handle to list of those already parsed
					revview.scripts.push( required.handle );
				}, this );
			}

			// If additional stylesheets are required by the revision, parse them
			if ( _.isObject( response.styles ) ) {
				$( response.styles ).each( function() {
					// Add stylesheet handle to list of those already parsed
					revview.styles.push( this.handle );
				} );
			}
		},

		/**
		 * Shows UI for revision selection. Hides start button, shows stop button.
		 */
		showUI: function() {
			this.$el.removeClass( 'revview-off' );
			this.$el.addClass( 'revview-on' );
		},

		/**
		 * Hides UI for revision selection. Hides stop button, shows start button.
		 */
		hideUI: function() {
			this.$el.removeClass( 'revview-on' );
			this.$el.addClass( 'revview-off' );
		},

		showLoading: function() {
			this.$el.addClass( 'revview-loading' );
			this.$stage.addClass( 'revview-loading' );
		},

		hideLoading: function() {
			this.$el.removeClass( 'revview-loading' );
			this.$stage.removeClass( 'revview-loading' );
		}
	});

	// Load all revision IDs
	var RevisionSelector = new revview.RevisionSelectorModel,
		RevisionTooltip = new revview.RevisionTooltipModel,
		RevisionInfo = new revview.RevisionInfoModel,
		RevisionApp;

	$(document).ready(function(){

		RevisionApp = new revview.RevisionApp({
			model: new revview.RevisionAppModel,
			collection: new revview.RevisionList
		});

	});

})( jQuery );