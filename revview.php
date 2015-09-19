<?php
/**
 * Plugin Name: Revview
 * Plugin URI: https://github.com/eliorivero/revview
 * Description: Displays revisions of a post using REST API. Requires <a href="https://github.com/WP-API/WP-API">REST API plugin 2.0</a>.
 * Author: Elio Rivero
 * Version: 1.0
 * Author URI: http://queryloop.com/
 * License: GPL2
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Domain Path: /languages
 * Text Domain: revview
 */

if ( ! defined( 'ABSPATH' ) ) {
	// Exit if accessed directly
	exit;
}

/**
 * Class Revview
 *
 * @since 1.0.0
 */
class Revview {

	/**
	 * Class constructor
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function __construct() {
		add_action( 'plugins_loaded', array( $this, 'localization' ) );
		add_action( 'rest_api_init', array( $this, 'register_route_public_revisions' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'register_assets' ) );

		// Example
		add_filter( 'the_content', array( $this, 'revview_example' ) );
	}

	/**
	 * Registers endpoint to publicly access revisions of a specific post.
	 * Endpoint is /wp-json/wp/v2/posts/(?P<parent_id>[\d]+)/revisions/public
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_route_public_revisions() {
		require_once 'wp-rest-public-revisions-controller.php';
		foreach ( get_post_types( array( 'show_in_rest' => true ), 'objects' ) as $post_type ) {
			if ( post_type_supports( $post_type->name, 'revisions' ) ) {
				$revisions_controller = new WP_REST_Public_Revisions_Controller( $post_type->name );
				$revisions_controller->register_routes();
			}
		}
	}

	/**
	 * Initialize localization routines
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function localization() {
		load_plugin_textdomain( 'revview', false, dirname( plugin_basename( __FILE__ ) ) . '/languages/' );
	}

	/**
	 * Register JS and CSS files to load in front end.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_assets() {
		global $wp_post_types;
		$post_type = get_post_type();
		if ( is_singular() && isset( $wp_post_types[$post_type] ) && isset( $wp_post_types[$post_type]->show_in_rest ) &&
		$wp_post_types[$post_type]->show_in_rest ) {
			add_action( 'wp_footer', array( $this, 'print_templates' ) );
			wp_enqueue_style( 'revview', plugins_url( 'css/revview-front.css' , __FILE__ ) );
			wp_enqueue_script( 'revview', plugins_url( 'js/revview-front.js' , __FILE__ ), array( 'jquery', 'backbone', 'underscore', 'wp-util' ) );
			wp_localize_script( 'revview', 'revview', array(
				'root' => esc_url_raw( get_rest_url() ),
				'post_id' => get_the_ID(),
			) );
		}
	}

	/**
	 * Prints templates for revision display interface in front end.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function print_templates() {
		?>
		<script id="tmpl-revview-revision" type="text/html">
			<h3><a href="{{ data.link }}">{{ data.title.rendered }}</a></h3>
			<div>{{ data.date }}</div>
			<div>{{ data.content.rendered }}</div>
		</script>
		<?php
	}

	/**
	 * Simple example that outputs a div.revview so the revisions are displayed before the content.
	 *
	 * @param string $content
	 *
	 * @return string
	 */
	function revview_example( $content = '' ) {
		return '<div class="revview"></div>' . $content;
	}
}

new Revview();