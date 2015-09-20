/**
 * Revview - Interface
 */

var revview;

(function ( $ ) {

	'use strict';

	var RevisionList = Backbone.Collection.extend( {
			url: revview.root + 'revview/posts/' + revview.post_id + '/revisions/public'
		} ),

		RevisionView = Backbone.View.extend( {
			tagName   : 'li',
			template  : wp.template( 'revview-revision' ),
			initialize: function () {
				this.render();
			},
			render    : function () {
				this.$el.append( $( '<div />' ).html( $( this.template( this.model.toJSON() ) ) ).text() );
			}
		} ),

		RevisionListView = Backbone.View.extend( {
			tagName  : 'ul',
			className: 'revview-list',
			render   : function () {
				this.collection.each( function ( revision ) {
					var revisionItem = new RevisionView( { model: revision } );
					this.$el.append( revisionItem.el );
				}, this );
				return this;
			}
		} );

	var entries = new RevisionList();
	entries.fetch( {
		success: function ( collection ) {
			var listDisplay = new RevisionListView( {
				collection: collection
			} );
			$( '.revview' ).append( $( listDisplay.render().el ).fadeIn() );
		}
	} );

})( jQuery );