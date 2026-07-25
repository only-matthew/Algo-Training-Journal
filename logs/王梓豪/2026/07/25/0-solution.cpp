#include <bits/stdc++.h>
using namespace std;
int main()
{
    char a;
    string s,temp;
    while(cin>>temp)
    {
        s+=temp;
    }
    
    int x11=0,y11=0;
    int x21=0,y21=0;
    istringstream iss(s);
    while(iss>>a)
    {
        if(a=='W'){x11++;}
        if(a=='L'){y11++;}
        if(a=='E')break;
        if((x11>=11||y11>=11)&&(abs(x11-y11)>=2))
        {cout<<x11<<':'<<y11<<endl;x11=0;y11=0;}
    }
    cout<<x11<<':'<<y11<<endl<<endl;
    istringstream iss1(s);
    while(iss1>>a)
    {
        if(a=='W'){x21++;}
        if(a=='L'){y21++;}
        if(a=='E')break;
        if((x21>=21||y21>=21)&&(abs(x21-y21)>=2))
        {cout<<x21<<':'<<y21<<endl;x21=0;y21=0;}
        
    }
    cout<<x21<<':'<<y21<<endl;
}