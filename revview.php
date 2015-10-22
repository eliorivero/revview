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
	 * Areas where the View Post Revisions button can be placed.
	 *
	 * @since 1.0.0
	 * @access private
	 *
	 * @var array
	 */
	private $position_options = array();

	/**
	 * Markup of the View Post Revisions button.
	 *
	 * @since 1.0.0
	 * @access private
	 *
	 * @var array
	 */
	private $view_revisions_html = array();

	/**
	 * Position of the View Post Revisions button.
	 *
	 * @since 1.0.0
	 * @access private
	 *
	 * @var string
	 */
	private $view_revisions_position = '';

	/**
	 * Revision currently being served.
	 *
	 * @since 1.0.0
	 * @access private
	 *
	 * @var WP_Post
	 */
	private $requested_revision = '';

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
				add_action( 'loop_start', array( $this, 'replace_current_with_revision' ) );
				add_action( 'wp_footer', array( $this, 'revision_loaded_messenger' ) );
			} elseif ( 'enabled' === $_GET['revview'] ) {
				add_filter( 'show_admin_bar', '__return_false' );
				add_action( 'after_setup_theme', array( $this, 'prepare_template_replacement' ) );
			}
		} else {
			add_action( 'rest_api_init', array( $this, 'register_route_public_revisions' ) );
			add_action( 'wp_enqueue_scripts', array( $this, 'register_loader_assets' ) );
		}
		if ( is_admin() ) {
			$this->position_options = array(
				'top'    => __( 'Fixed at the Top', 'revview' ),
				'bottom' => __( 'Fixed at the Bottom', 'revview' ),
				'before' => __( 'Before Content', 'revview' ),
				'after'  => __( 'After Content', 'revview' ),
				'custom' => __( 'Custom Placement', 'revview' ),
			);
			add_action( 'admin_init', array( $this, 'add_settings' ) );
		}
	}

	/**
	 * Add options to Settings > Reading.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function add_settings() {
		add_settings_field( 'revview_position', '<label for="revview_position">' . __( 'Revview Placement', 'revview' ) . '</label>', array( $this,
			'revview_position_html' ), 'reading' );
		register_setting( 'reading', 'revview_position', array( $this, 'sanitize_revview_position' ) );
	}

	/**
	 * HTML code to display the option to select the placement of View Revisions button.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function revview_position_html() {
		?>
		<select name="revview_position" id="revview_position">
			<?php foreach ( $this->position_options as $value => $label ) : ?>
				<option value="<?php echo $value; ?>" <?php selected( $value, get_option( 'revview_position', 'top' ) ); ?>><?php echo esc_html( $label );
					?></option>
			<?php endforeach; ?>
		</select>
		<p class="description"><?php esc_html_e( 'Select where to display the "View Posts Revisions" button.', 'revview' ); ?></p>
		<p class="js-revview-custom-help hidden"><small><?php esc_html_e( 'For custom button placement, add the following in your PHP template files,
		where you want to display it:', 'revview' ); ?><br/><code><?php echo esc_html( '<?php do_action( \'revview_view_revisions_button\' ); ?>' );
					?></code></small></p>
		<style type="text/css">
			.no-js .js-revview-custom-help {
				display: block;
			}
		</style>
		<script type="text/javascript">
			window.addEventListener( 'load', function() {
				var position = document.getElementById( 'revview_position' ),
					customHelp = document.getElementsByClassName( 'js-revview-custom-help' )[0],
					removeClass_hidden = new RegExp( 'hidden', 'gi' );
				if ( 'custom' === position.value ) {
					customHelp.className = customHelp.className.replace( removeClass_hidden, '' );
				}
				position.addEventListener( 'change', function() {
					if ( 'custom' === position.value ) {
						customHelp.className = customHelp.className.replace( removeClass_hidden, '' );
					} else if ( ! new RegExp(' hidden', 'gi').test( customHelp.className ) ) {
						customHelp.className += 'hidden';
					}
				} );
			} );
		</script>
		<?php
	}

	/**
	 * Checks that the value trying to be saved is in the list of expected values.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param $value
	 *
	 * @return string
	 */
	public function sanitize_revview_position( $value ) {
		return in_array( $value, array_keys( $this->position_options ) ) ? $value : 'top';
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
		if ( is_singular() && $this->get_available_base_rest() && empty( $post->post_password ) && ! is_customize_preview() ) {
			wp_enqueue_style( 'revview', plugins_url( 'css/revview-loader.css' , __FILE__ ) );
			wp_enqueue_script( 'revview', plugins_url( 'js/revview-loader.js' , __FILE__ ) );

			// Save position option
			$this->view_revisions_position = get_option( 'revview_position', 'top' );

			// Get singular name for "View {singular post type name} Revisions"
			$post_type = get_post_type_object( $post->post_type );
			$singular_name = $post_type->labels->singular_name;

			// Get link to revision selection UI
			$view_revisions_link = add_query_arg( 'revview', 'enabled', get_permalink( $post ) );
			if ( is_ssl() ) {
				$view_revisions_link = str_replace( 'http:', 'https:', $view_revisions_link );
			}

			// Compile HTML for button
			$this->view_revisions_html = '<div id="revview" class="revview-' . $this->view_revisions_position . '"/>';
			$this->view_revisions_html .= sprintf( '<a class="revview-button revview-start" href="%s">%s</a><!-- /.revview-button -->',
				esc_url( $view_revisions_link ),
				esc_html( sprintf( __( 'View %s Revisions', 'revview' ), $singular_name ) )
			);
			$this->view_revisions_html .= '</div><!-- /#revview -->';

			if ( 'top' == $this->view_revisions_position || 'bottom' == $this->view_revisions_position ) {
				// If top or bottom, output in footer.
				add_action( 'wp_footer', array( $this, 'view_revisions_button_output' ) );
			} elseif ( 'before' == $this->view_revisions_position || 'after' == $this->view_revisions_position ) {
				// If before or after, filter the content to insert it.
				add_filter( 'the_content', array( $this, 'view_revisions_button_content' ), 9 );
			} else {
				// Otherwise, user should add the proper action
				add_action( 'revview_view_revisions_button', array( $this, 'view_revisions_button_output' ) );
			}
		}
	}

	/**
	 * Output View Revisions button.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function view_revisions_button_output() {
		echo $this->view_revisions_html;
	}

	/**
	 * Insert View Revisions button before or after the content according to user selection.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param string $content
	 *
	 * @return string
	 */
	public function view_revisions_button_content( $content = '' ) {
		if ( ! is_admin() && is_main_query() ) {
			if ( 'before' == $this->view_revisions_position ) {
				return $this->view_revisions_html . $content;
			} else {
				return $content . $this->view_revisions_html;
			}
		}
		return $content;
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
	 * If we're in the right context, replace template.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	function prepare_template_replacement() {
		if ( ! is_customize_preview() ) {
			add_theme_support( 'title-tag' );
			add_filter( 'wp_title', array( $this, 'revision_selection_page_title' ) );
			add_filter( 'single_template', array( $this, 'replace_singular_template' ) );
			add_filter( 'page_template', array( $this, 'replace_singular_template' ) );
			add_filter( 'singular_template', array( $this, 'replace_singular_template' ) );
			add_action( 'wp_enqueue_scripts', array( $this, 'register_selection_ui_assets' ) );
			add_filter( 'body_class', array( $this, 'body_class' ) );
		}
	}

	/**
	 * Compose title of revision selection frame.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @return string
	 */
	function revision_selection_page_title() {
		return esc_html( sprintf( __( 'Revisions of %s', 'revview' ), single_post_title( '', false ) ) );
	}

	/**
	 * In singular views, check if we should look for templates of this plugin.
	 *
	 * @since 1.0.0
	 * @access public
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
	 * @access private
	 *
	 * @param string $template
	 *
	 * @return mixed|void
	 */
	private function get_template( $template ) {
		$template = $template . '.php';
		$file = plugin_dir_path( __FILE__ ) . 'templates/' . $template;
		return apply_filters( 'revview_singular_template_' . $template, $file );
	}

	/**
	 * If we've loaded Revview selection UI, set identifying class and detect theme.
	 *
	 * @since 1.0.0
	 * @access public
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
			<button class="revview-button revview-stop" title="<?php esc_attr_e( 'Close Revisions', 'revview' ); ?>"><?php esc_html_e( '&times;', 'revview' )
				?></button>
		</script>
		<script id="tmpl-revview-tooltip" type="text/html">
			<span class="revview-tooltip-date">{{ data.display.date }}</span>
			<span class="revview-tooltip-author"><em><?php esc_html_e( 'By', 'revview' ); ?></em> {{ data.display.author_name }}</span>
		</script>
		<script id="tmpl-revview-info" type="text/html">
			<h4 class="revview-info-heading"><?php esc_html_e( 'Current Revision', 'revview' ) ?></h4> <div class="revview-info-content"><span class="revview-info-date">{{ data.date }}</span> <?php esc_html_e( 'by', 'revview' ); ?> <span class="revview-info-author">{{ data.author_name }}</span></div>
		</script>
		<?php
	}

	/**
	 * If a loop started, check if it's the main query, in which case, add filters to append divs.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param WP_Query $wp_query
	 */
	function replace_current_with_revision( $wp_query ) {
		if ( $wp_query->is_main_query() && isset( $_POST['revview_revision_id'] ) && ! empty( $_POST['revview_revision_id'] ) && is_numeric( $_POST['revview_revision_id'] ) ) {

			$this->requested_revision = wp_get_post_revision( $_POST['revview_revision_id'] );
			if ( $this->requested_revision instanceof WP_Post ) {

				$parent = get_post( $this->requested_revision->post_parent );
				if ( $parent instanceof WP_Post ) {

					$parent_post_status = get_post_status_object( $parent->post_status );
					/**
					 * Filters the status of the parent entry whose revision was requested.
					 *
					 * @param bool $parent_post_status_public Whether the post status of the parent entry is public or not.
					 * @param int $post The ID of the entry parent of the requested revision.
					 */
					if ( apply_filters( 'revview_allow_revision_load', $parent_post_status->public && empty( $parent->post_password ), $parent->ID ) ) {
						add_filter( 'the_title', array( $this, 'revview_title' ), 0 );
						add_filter( 'the_content', array( $this, 'revview_content' ), 0 );
						add_filter( 'the_excerpt', array( $this, 'revview_excerpt' ), 0 );
					}
				}
			}
		}
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the title.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param string $title
	 *
	 * @return string
	 */
	function revview_title( $title = '' ) {
		return sanitize_post_field( 'post_title', $this->requested_revision->post_title, $this->requested_revision->post_parent, 'display' );
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the content.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param string $content
	 *
	 * @return string
	 */
	function revview_content( $content = '' ) {
		return sanitize_post_field( 'post_content', $this->requested_revision->post_content, $this->requested_revision->post_parent, 'display' );
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the excerpt.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param string $excerpt
	 *
	 * @return string
	 */
	function revview_excerpt( $excerpt = '' ) {
		return sanitize_post_field( 'post_excerpt', $this->requested_revision->post_excerpt, $this->requested_revision->post_parent, 'display' );
	}
}

new Revview();