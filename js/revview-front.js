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
				return WP_API_Settings.root + 'revview/v1/' + revview.rest_base + '/' + revview.post_id + '/revisions/' + id;
			},

			defaults: _.extend( {},
				wp.api.models.Revision.prototype.defaults,
				{
					author_name: '',
					loaded: false,
					cachedRevision: ''
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
				return WP_API_Settings.root + 'revview/v1/' + revview.rest_base + '/' + id + '/revisions/ids';
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
			'mouseenter' : 'mouseEnter',
			'change .revview-select' : 'dropdownChanged'
		},

		currentRevisionIndex: 0,

		initialize: function( args ) {
			this.tooltip = args.tooltip;
			this.app = args.app;

			_.bindAll( this, 'stop', 'mouseMove', 'mouseLeave', 'mouseEnter', 'refreshBarOffset', 'dropdownChanged' );

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

			// Render fallback select used for small mobile screens
			this.$selectDropdown = $( '<select class="revview-select">' + _.map( this.selectorRevisions, function( option, index ) { return '<option value="' + index + '">' + option.date + ' &mdash; ' + option.author_name + '</option>'; } ) + '</select>' );
			this.$el.prepend( this.$selectDropdown );

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
		 * User changes the fallback select control.
		 *
		 * @param {object} e Select element event
		 */
		dropdownChanged: function ( e ) {
			var value = parseInt( e.currentTarget.value );
			this.$el.slider( 'value', value );
			this.selectRevision( value );
		},

		/**
		 * User stopped dragging the slider handle or clicked on the selection bar.
		 *
		 * @param { object } e
		 * @param where
		 */
		stop: function( e, where ) {
			this.$selectDropdown.val( where.value );
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
		
		template: wp.template( 'revview-app' ),

		events: {
			'click .revview-stop' : 'stopRevisions',
			'update'              : 'hideLoading'
		},

		$iframe: null,
		$stage: null,
		revisionURL: '',
		origin: '',

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
			this.listenTo( this.model, 'change:currentRevision', this.placeRevision );
			this.listenToOnce( this.collection, 'sync', this.firstSync );

			_.bindAll( this, 'renderAreaLoaded', 'requestPage', 'requestPageSuccess' );

			// Save window origin using a fallback for browsers that don't have it
			this.origin = window.location.origin ? window.location.origin : window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port : '');

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
			this.collection.fetch();
		},

		/**
		 * Goes back to where it was before entering revision viewing ui.
		 */
		stopRevisions: function() {
			var params = document.location.search.slice( 1 ).split( '&' );
			document.location = document.location.href.replace( document.location.search, ( params.length > 1 ? '?' : '' ) + _.filter( params, function( param ) { return 'revview=enabled' !== param; } ).join( '&' ) );
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
				query.data = {
					revview_revision_id: model.get( 'id' )
				};
			}

			$.ajax(
				this.revisionURL,
				query
			);
		},

		/**
		 * If request ended up ok, receive page HTML, cache it, and start rendering page.
		 *
		 * @param { string } response
		 */
		requestPageSuccess: function( response ) {
			var index = this.model.get( 'currentRevision' ),
				model = this.collection.at( index );
			this.collection.remove( this.collection.at( index ) );
			model.set( 'cachedRevision', response );
			this.collection.add( model, { at: index, merge: true } );

			this.renderPage( response );
		},

		/**
		 * Write to iframe the content of response, either fresh or previously cached.
		 *
		 * @param { string } response
		 */
		renderPage: function( response ) {
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
			if ( e.origin == this.origin ) {
				if ( e.data == 'revview-synced' ) {
					this.$el.trigger( 'update' );
				}
			}
		},

		/**
		 * Load selected revision.
		 * Updates displayed revision information.
		 */
		placeRevision: function() {
			this.showLoading();
			var requestedRevision = this.collection.at( this.model.get( 'currentRevision' ) ),
				cachedResponse = requestedRevision.get( 'cachedRevision' );

			if ( _.isEmpty( cachedResponse ) ) {
				this.requestPage( requestedRevision );
			} else {
				this.renderPage( cachedResponse );
			}

			// Update revision information display
			this.refreshInfo( this.model.get( 'currentInfo' ) );
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
				this.$el.prepend( $('<div class="revview-revision-list" />').append( [this.revisionTooltip.render().el, this.revisionSelector.render().el, this.revisionInfo.render().el, $('<div class="revview-progress"><span></span><span></span><span></span></div>')] ) );

				// Current revision is already loaded: is the current content, so fill in revision info and trigger change to initialize.
				this.model.set( 'currentInfo', this.revisionSelector.selectorRevisions[0] );
				this.model.trigger( 'change:currentRevision' );

				// Focus handle so user can use previous/next keyboard arrows to go through the revisions.
				this.$el.find( '.ui-slider-handle' ).focus();
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