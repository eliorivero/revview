/**
 * Revview - Button to initialize revision selection.
 */

var revviewLoader;

(function ( $ ) {
	'use strict';

	$( window ).load( function() {

		var $body = $( 'body' ),
			$revview = $( '<div id="revview" />' ),
			url = document.location.href.replace( document.location.search, '' ).replace( document.location.hash, '' ) + '?revview=enabled';

		$( '<a class="revview-button revview-start" href="' + url + '" >' ).text( revviewLoader.view_revisions ).appendTo( $revview );

		$body.append( $revview );

		if ( 'static' !== $body.css( 'position' ) ) {
			$revview.addClass( 'body-not-static' );
		}
		$revview.addClass( 'revview-loaded' );
	} );

})( jQuery );