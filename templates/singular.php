<?php
/**
 * Template used by Revview to show only the revision selection bar and the iframe
 *
 * @since 1.0.0
 */
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
	<meta name="robots" content="noindex, nofollow">
	<link rel="profile" href="http://gmpg.org/xfn/11">
	<?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>

<div id="revview-stage">
	<iframe id="revview-render"></iframe>
</div>

<?php wp_footer(); ?>
</body>