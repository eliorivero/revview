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
		if ( isset( $_GET['revview'] ) ) {
			if ( 'render' === $_GET['revview'] ) {
				add_filter( 'show_admin_bar', '__return_false' );
				add_action( 'wp_footer', array( $this, 'revision_loaded_messenger' ) );
			} else {
				add_action( 'wp_enqueue_scripts', array( $this, 'register_selection_ui_assets' ) );
				add_filter( 'single_template', array( $this, 'replace_singular_template' ) );
				add_filter( 'body_class', array( $this, 'body_class' ) );
			}
		} else {
			add_action( 'rest_api_init', array( $this, 'register_route_public_revisions' ) );
			add_action( 'wp_enqueue_scripts', array( $this, 'register_loader_assets' ) );
		}
		add_action( 'loop_start', array( $this, 'add_discoverable_elements' ) );
	}

	/**
	 * Registers endpoints to publicly access revisions of a specific post.
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
	 * Load CSS files for revision selection loader.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_loader_assets() {
		$post = get_post();
			add_action( 'wp_footer', array( $this, 'add_link_to_revision_selection' ) );
		if ( is_singular() && $this->get_available_base_rest() && empty( $post->post_password ) ) {
			wp_enqueue_style( 'revview', plugins_url( 'css/revview-loader.css' , __FILE__ ) );
		}
	}

	/**
	 * Add wrapper and link to view revisions.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function add_link_to_revision_selection() {
		$url = is_ssl() ? preg_replace( '/^(http:)/i', 'https:', get_permalink(), 1 ) : get_permalink();
		?>
		<div id="revview">
			<a href="<?php echo esc_url( add_query_arg( 'revview', 'enabled', $url ) ) ?>" title="<?php esc_attr_e( 'Start viewing revisions', 'revview' ); ?>" class="revview-button revview-start">
				<?php esc_html_e( 'View revisions', 'revview' ) ?>
			</a>
		</div>
		<?php
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
	public function register_selection_ui_assets() {
		if ( is_singular() && $rest_base = $this->get_available_base_rest() ) {
			add_action( 'wp_footer', array( $this, 'print_templates' ) );

			wp_enqueue_style( 'revview', plugins_url( 'css/revview-front.css' , __FILE__ ) );
			wp_register_script( 'revview-date', plugins_url( 'js/revview-date.js' , __FILE__ ) );
			wp_enqueue_script( 'revview', plugins_url( 'js/revview-front.js' , __FILE__ ), array( 'wp-api', 'wp-util', 'jquery-ui-slider', 'revview-date'
			) );
			wp_localize_script( 'revview', 'revview', apply_filters( 'revview_selection_ui_js_variables', array(
				'rest_base' => $rest_base,
				'post_id' => get_the_ID(),
				'datetime_format' => get_option( 'date_format' ) . ' ' . get_option( 'time_format' ),
			) ) );
		}
	}

	/**
	 * In singular views, check if we should look for templates of this plugin.
	 *
	 * @since 1.0.0
	 *
	 * @param $template
	 *
	 * @return mixed|void
	 */
	function replace_singular_template( $template ) {
		if ( is_singular() && $this->get_available_base_rest() ) {
			return $this->get_template( 'singular' );
		}
		return $template;
	}

	/**
	 * Replace template for singular view for one that only loads Revview selection UI and the iframe to view revisions.
	 *
	 * @since 1.0.0
	 *
	 * @param string $template
	 *
	 * @return mixed|void
	 */
	function get_template( $template ) {
		$template = $template . '.php';
		$file = plugin_dir_path( __FILE__ ) . 'templates/' . $template;
		return apply_filters( 'revview_singular_template_' . $template, $file );
	}

	/**
	 * If we've loaded Revview selection UI, set identifying class and detect theme.
	 *
	 * @since 1.0.0
	 *
	 * @param array $classes
	 *
	 * @return array
	 */
	function body_class( $classes ) {
		$classes[] = 'revview-ui';

		$classes[] = get_stylesheet();

		return $classes;
	}

	/**
	 * In revision preview loaded in iframe, writes JS that sends a message to top window,
	 * reporting that iframe load finished.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function revision_loaded_messenger() {
		?>
		<script type="text/javascript">
			(function(window){
				window.addEventListener( 'load', function() {
					var origin = window.location.origin ? window.location.origin : window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
					window.top.postMessage( 'revview-synced', origin );
				});
			})(window);
		</script>
		<?php
	}

	/**
	 * Checks if revisions are enabled, post has more than one revision and the type of current post is visible in REST.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @return bool|string If revisions for current entry aren't available, returns false. Otherwise a string for REST endpoint base.
	 */
	public function get_available_base_rest() {
		static $rest_base;
		if ( ! isset( $rest_base ) ) {
			$post = get_post();
			if ( $post instanceof WP_Post && wp_revisions_enabled( $post ) && 1 < count( wp_get_post_revisions() ) ) {
				$post_type = get_post_type_object( get_post_type( $post ) );
				$rest_base = isset( $post_type->show_in_rest ) && $post_type->show_in_rest ? $post_type->rest_base : false;
			} else {
				$rest_base = false;
			}
		}
		return $rest_base;
	}

	/**
	 * Prints templates for revision display interface in front end.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function print_templates() {
		?>
		<script id="tmpl-revview-app" type="text/html">
			<button class="revview-button revview-stop"><?php esc_html_e( '&times;', 'revview' ) ?></button>
		</script>
		<script id="tmpl-revview-tooltip" type="text/html">
			<span class="revview-tooltip-date">{{ data.display.date }}</span>
			<span class="revview-tooltip-author"><em><?php esc_html_e( 'By', 'revview' ); ?></em> {{ data.display.author_name }}</span>
		</script>
		<script id="tmpl-revview-info" type="text/html">
			<h4 class="revview-info-heading"><?php esc_html_e( 'Current Revision', 'revview' ) ?></h4> <span class="revview-info-date">{{ data.date }}</span> <?php esc_html_e( 'by', 'revview' ); ?> <span class="revview-info-author">{{ data.author_name }}</span>
		</script>
		<?php
	}

	/**
	 * If a loop started, check if it's the main query, in which case, add filters to append divs.
	 *
	 * @param object $wp_query
	 */
	function add_discoverable_elements( $wp_query ) {
		if ( $wp_query->is_main_query() ) {
			add_filter( 'the_title', array( $this, 'revview_title' ), 0 );
			add_filter( 'the_content', array( $this, 'revview_content' ), 0 );
			add_filter( 'the_excerpt', array( $this, 'revview_excerpt' ), 0 );
		}
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the title.
	 *
	 * @param string $title
	 *
	 * @return string
	 */
	function revview_title( $title = '' ) {
		if ( isset( $_POST['title'] ) ) {
			$post = get_post();
			if ( $post instanceof WP_Post ) {
				return sanitize_post_field( 'post_title', $_POST['title'], $post->ID, 'display' );
			}
		}
		return $title;
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the content.
	 *
	 * @param string $content
	 *
	 * @return string
	 */
	function revview_content( $content = '' ) {
		if ( isset( $_POST['content'] ) ) {
			$post = get_post();
			if ( $post instanceof WP_Post ) {
				return sanitize_post_field( 'post_content', $_POST['content'], $post->ID, 'display' );
			}
		}
		return $content;
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the excerpt.
	 *
	 * @param string $excerpt
	 *
	 * @return string
	 */
	function revview_excerpt( $excerpt = '' ) {
		if ( isset( $_POST['excerpt'] ) ) {
			$post = get_post();
			if ( $post instanceof WP_Post ) {
				return sanitize_post_field( 'post_excerpt', $_POST['excerpt'], $post->ID, 'display' );
			}
		}
		return $excerpt;
	}
}

new Revview();