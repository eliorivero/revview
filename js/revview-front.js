/**
 * Revview Interface
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
					console.log( 'Returning already loaded model', found );
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

						console.log( 'Returning loaded model after insertion', found );
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

		initialize: function() {
			this.listenTo( this.model, 'change:display', this.render );
			this.listenTo( this.model, 'change:mouseX', this.updatePosition );
			this.listenTo( this.model, 'change:visible', this.updateVisibility );
			this.$el.hide();
		},

		updatePosition: function() {
			this.$el.css( 'left', this.model.get( 'mouseX' ) + 'px' );
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

			_.bindAll( this, 'stop', 'mouseMove', 'mouseLeave', 'mouseEnter' );

			this.refreshTooltip = _.throttle( this.refreshTooltip, 300 );
		},

		render: function() {
			this.model.set( 'max', this.model.get( 'revisions' ).length - 1 );

			this.selectorRevisions = this.model.get( 'revisions' ).invoke( 'pick', [ 'author_name', 'date' ] );
			_.map( this.selectorRevisions, function( selectorRevision ) {
				selectorRevision.date = revviewDate( revview.datetime_format, selectorRevision.date );
			});

			this.$el.slider( _.extend( this.model.toJSON(), {
				stop: this.stop
			}) );

			var max = this.model.get( 'max' ),
				spacing = 100 / max;

			for ( var i = 0; i <= max; i++ ) {
				$( '<span class="revview-tick"></span>' ).css( 'left', ( spacing * i ) +  '%' ).appendTo( this.$el );
			}

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
			var offset = $obj.offset() || {top: 0, left: 0}, win = $(window);
			return win.width()  - offset.left - $obj.outerWidth();
		},

		mouseEnter: function() {
			this.tooltip.model.set( 'visible', true );
		},

		mouseLeave: function() {
			this.tooltip.model.set( 'visible', false );
		},

		refreshTooltip: function() {
			this.tooltip.model.set( 'display', this.selectorRevisions[this.currentRevisionIndex] );
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

		current: {},
		original: {},

		initialize: function() {
			// Get title, content and excerpt in page and save them
			this.original = this.getAvailableElements();
			this.current = this.original;

			// Revision tooltip
			this.revisionTooltip = new revview.RevisionTooltipView({
				model: RevisionTooltip
			});

			// Current revision information
			this.revisionItemInfo = new revview.RevisionInfoView({
				model: RevisionInfo
			});

			// Revision selector
			this.revisionItem = new revview.RevisionSelectorView({
				model: RevisionSelector,
				tooltip: this.revisionTooltip,
				app: this
			});

			this.listenTo( this.collection, 'request', this.showLoading );
			this.listenTo( this.collection, 'sync', this.hideLoading );
			this.listenTo( this.model, 'change:currentRevision', this.changeRevision );
			this.listenToOnce( this.collection, 'sync', this.start );
			this.listenTo( this.collection, 'change', this.placeRevision );

			this.collection.fetch();
		},

		/**
		 * Return available title, content and excerpt as jQuery objects.
		 *
		 * @returns { Object }
		 */
		getAvailableElements: function() {
			var elements = {};
			_.each( ['title', 'content', 'excerpt'], function ( element ) {
				var $element = $( '.revview-' + element ).eq( 0 ).parent();
				if ( $element.length > 0 ) {
					elements[element] = $element;
				}
			} );
			return elements;
		},

		/**
		 * Initializes UI preparing revision selector list with author name and date, adds UI to page and loads the latest revision saved.
		 *
		 * @param { Object } collection
		 */
		start: function( collection ) {
			if ( collection.length > 0 ) {
				// Load collection with only author name and date
				this.revisionItem.model.set( 'revisions', collection );

				// Add revision UI to page
				$( 'body' ).append( this.render().$el.fadeIn() );

				// Load most recent revision
				this.model.set( 'currentInfo', collection.at(0).toJSON() );
				this.model.trigger( 'change:currentRevision' );
			}
		},

		render: function () {
			this.$el.append( [this.revisionTooltip.render().el, this.revisionItem.render().el, this.revisionItemInfo.render().el] );
			this.$el.wrapInner('<div class="revview-revision-list" />');
			return this;
		},

		/**
		 * Replace current title, content and excerpt with those in selected revision.
		 * Updates displayed revision information.
		 *
		 * @param { Object } model
		 */
		placeRevision: function( model ) {
			this.hideLoading();
			console.log( 'Revision found', model );

			// Place revision title, content and excerpt if each one exists.
			_.each( this.current, function( $element, key ){
				$element.empty().append( this.getHTML( model, key ) );
			}, this );

			// Update revision information display
			this.refreshInfo( this.model.get( 'currentInfo' ) );
		},

		/**
		 * Check if title, content or excerpt are available in the model, even if they're empty,
		 * and return them as HTML for insertion.
		 *
		 * @param { Object } model
		 * @param { string } field
		 * @returns { String } Markup to insert.
		 */
		getHTML: function( model, field ) {
			var properties = model.toJSON(),
				rendered = '';
			if ( properties.hasOwnProperty( field ) ) {
				var property = properties[field];
				if ( ! _.isUndefined( property.rendered ) ) {
					rendered = property.rendered;
				}
			}
			return $( '<div>' + rendered + '</div>' ).html();
		},

		changeRevision: function() {
			this.showLoading();
			this.collection.getRevision( this.model.get( 'currentRevision' ) );
		},

		refreshInfo: function( currentInfo ) {
			if ( !_.isUndefined( currentInfo ) ) {
				this.revisionItemInfo.model.set( currentInfo );
			}
		},

		showLoading: function() {
			this.$el.addClass( 'revview-loading' );
		},

		hideLoading: function() {
			this.$el.removeClass( 'revview-loading' );
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