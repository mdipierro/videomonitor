# table that stores videos
db.define_table(
    'video',
    Field('camera'),                              # name of the camera recording
    Field('webm','blob'),                         # the actual video as a blob (webm format) OPTIONAL
    Field('cover_image','blob'),                  # the binary cover image
    Field('max_motion','integer'),                # a flag which indicates if the video has motion or not                
    Field('tags','list:string'),                  # list of tags associated to the event in this video
    Field('start_motion','datetime'),             # timestamp of the start of the video recording
    Field('duration','integer'),                  # total turation in seconds of the video
    auth.signature)
