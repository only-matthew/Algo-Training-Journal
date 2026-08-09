#include <bits/stdc++.h>
using namespace std;

int main() {
    string a,b;
	char da,db;
    cin>>a>>da>>b>>db;
    int cnta=0,cntb=0;
    for(char ch:a)
    {
        if(ch==da)
        cnta++;
    }
    for(char ch:b)
    {
        if(ch==db)
        cntb++;
    }
    long long pa=0,pb=0;
    while(cnta--)
    {
        pa=pa*10+(da-'0');
    }
    while(cntb--)
    {
        pb=pb*10+(db-'0');
    }
    cout<<pa+pb;
}