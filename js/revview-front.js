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
		},

		initialize: function() {
			// Listen for internal changes
			this.on( 'change:currentRevision', this.update );
		},

		update: function() {
			console.log( this.get( 'currentRevision' ) );
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

			this.refreshTooltip(0);

			return this;
		},

		selectRevision: function( index ) {
			this.model.set( 'currentRevision', index );
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

	revview.RevisionInterfaceModel = Backbone.Model.extend({
		defaults: {
			currentRevisionIndex: 0
		}
	});

	/**
	 * Backbone View for interface to select revisions.
	 */
	revview.RevisionInterface = Backbone.View.extend({
		id: 'revview',

		current: {},
		original: {},

		initialize: function() {
			this.original = {
				$title: $('.revview-title').eq(0).parent(),
				$content: $('.revview-content').eq(0).parent(),
				$excerpt: $('.revview-excerpt').eq(0).parent()
			};
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
				tooltip: this.revisionTooltip
			});

			this.listenTo( this.collection, 'request', this.showLoading );
			this.listenTo( this.collection, 'sync', this.hideLoading );
			this.listenTo( this.revisionItem.model, 'change:currentRevision', this.changeRevision );
			this.listenToOnce( this.collection, 'sync', this.start );
			this.listenTo( this.collection, 'change', this.placeRevision );

			this.collection.fetch();
		},

		start: function( collection ) {
			if ( collection.length > 0 ) {
				console.log( 'Revision collection', collection );
				this.revisionItem.model.set( 'revisions', collection );
				$( 'body' ).append( $( this.render().el ).wrapInner('<div class="revview-revision-list" />').fadeIn() );
				this.refreshInfo(0);
			}
		},

		render: function () {
			this.$el.append( this.revisionTooltip.render().el );
			this.$el.append( this.revisionItem.render().el );
			this.$el.append( this.revisionItemInfo.render().el );
			return this;
		},

		placeRevision: function( model ) {
			this.hideLoading();
			console.log( 'Revision found', model );

			this.current.$title.empty().append( this.getHTML( model, 'title' ) );
			this.current.$content.empty().append( this.getHTML( model, 'content') );
			this.current.$excerpt.empty().append( this.getHTML( model, 'excerpt') );

			this.refreshInfo( this.revisionItem.model.get( 'currentRevision' ) );
		},

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
			this.collection.getRevision( this.revisionItem.model.get( 'currentRevision' ) );
		},

		refreshInfo: function( index ) {
			if ( !_.isUndefined( this.revisionItem.selectorRevisions ) ) {
				this.revisionItemInfo.model.set( this.revisionItem.selectorRevisions[index] );
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
		RevisionInterface;

	$(document).ready(function(){

		RevisionInterface = new revview.RevisionInterface({
			model: new revview.RevisionInterfaceModel,
			collection: new revview.RevisionList
		});

	});

})( jQuery );