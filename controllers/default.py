# -*- coding: utf-8 -*-
import datetime

def index():
    # default landing page for now just redirect to main
    if auth.user:
        redirect(URL('main'))
    return dict()

def main():
    # must be called with main/<camera-id> else redirect to main/<user.camera[0]>
    cameras = auth.user and auth.user.cameras or ['webcam']
    if not request.args(0) in cameras:
        redirect(URL(args=cameras[0]))        
    return dict()

@auth.requires_login()
def upload():
    # do not try save session for speed
    session.forget()
    return
    try:
        # retrieve the camera name from the POST
        camera = request.post_vars.camera
        # retrieve the tags sent by the client with the POST
        tags = request.post_vars.tags.split(',')
        # retrieve the other metadata sent by the client with the POST
        duration = int(request.post_vars.duration)/1000
        timestamp = int(request.post_vars.start_motion)/1000
        start_motion = datetime.datetime.fromtimestamp(timestamp)
        max_motion = int(request.post_vars.max_motion)
        # upload the movie
        blob = request.post_vars.blob.file.read() if 'blob' in request.post_vars else ''
        # and the cover image also sent by the client with the POST
        cover_image = request.post_vars.cover_image
        # store the video in the db.video table
        video_id = db.video.insert(tags=tags,duration=duration,
                                   start_motion=start_motion,webm=blob,
                                   cover_image=cover_image,
                                   max_motion=max_motion,camera=camera)
        # return the ID of the uploaded video
        return str(video_id)
    except Exception,e:
        # oops something bad happened? this is mostly for production
        return str(e)

def search():
    # do not try save the session for speed
    session.forget()
    response.headers['Content-Type'] = 'application/json'
    # retrieve the camera being searched and the search tags
    camera = request.vars.camera
    tags = request.vars.tags
    # build the search query
    limit = min(10, int(request.vars.limit or 1))    
    # in demo mode always show default videos, not the user one because user cannot upload
    if auth.user:
        query = (db.video.camera==camera)&(db.video.created_by==auth.user.id)
    else:
        query = (db.video.camera=='webcam')&(db.video.created_by==1)
    # include the search tags in the query
    if tags and tags.strip():
        keywords = tags.strip().lower().split()
        query &= reduce(lambda a,b:a&b, [db.video.tags.contains(k) for k in keywords])
    # incude the date constraints in the query
    if request.vars.before:
        query &= db.video.start_motion<request.vars.before
        orderby = db.video.start_motion
    elif request.vars.after:
        query &= db.video.start_motion>request.vars.after
        orderby = db.video.start_motion
    else:
        orderby = ~db.video.start_motion
    # execute the query
    rows = db(query).select(db.video.id, db.video.cover_image, db.video.tags, 
                            db.video.start_motion,  db.video.duration,
                            limitby=(0,limit),orderby=orderby)
    # reverse the selected if requsted in descending order
    if not request.vars.before and not request.vars.after:
        rows.records.reverse()
    # return select in json format
    return rows.as_json()

def video():
    # do not save the session
    session.forget()
    # retrieve and return the video (webm format)
    response.headers['Content-type'] = 'video/webm'
    video = db.video(request.args(0,cast=int),
                     created_by=1 if DEMO else auth.user_id)
    return '' if not video else video.webm

# default service actions (web2py scaffolding)
def user(): return dict(form=auth())

@cache.action()
def download(): return response.download(request, db)
