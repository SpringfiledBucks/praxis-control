project('praxis-control-linux', version: '0.2.0-beta.1', meson_version: '>= 0.60')

gnome = import('gnome')
prefix = get_option('prefix')
datadir = prefix / get_option('datadir')
pkgdatadir = datadir / 'praxis-control-linux'
launcher_configuration = configuration_data()
launcher_configuration.set('pkgdatadir', pkgdatadir)

configure_file(
  input: 'praxis-control-linux.in',
  output: 'praxis-control-linux',
  configuration: launcher_configuration,
  install: true,
  install_dir: get_option('bindir'),
  install_mode: 'rwxr-xr-x',
)

install_data('src/app.mjs', 'src/core.mjs', install_dir: pkgdatadir)
install_data('data/io.praxiscontrol.App.desktop', install_dir: datadir / 'applications')
install_data('data/io.praxiscontrol.App.svg', install_dir: datadir / 'icons/hicolor/scalable/apps')

gnome.post_install(update_desktop_database: true, gtk_update_icon_cache: true)
